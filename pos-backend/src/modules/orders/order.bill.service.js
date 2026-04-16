const prisma = require('../../config/prisma');
const { AppError } = require('../../utils/errors');
const { calculateOrderHppSnapshot } = require('../../utils/hpp');
const { generateReceiptMetadata } = require('../../utils/receipt');
const { supportsProductVariants } = require('../../utils/productVariantPolicy');

const MAX_ITEMS = 50;
const MAX_QTY_PER_ITEM = 999;
const REQUEST_ORDER_TYPES = ['DINE_IN', 'TAKE_AWAY', 'DELIVERY'];
const ACTIVE_TABLE_BILL_STATUSES = ['DRAFT', 'PENDING_PAYMENT'];
const MUTABLE_BILL_STATUSES = new Set(['DRAFT', 'PENDING_PAYMENT']);
const PENDING_PAYMENT_STATUSES = ['INITIATED', 'PENDING'];
const normalizeStoredOrderType = (orderType) => (
  orderType === 'DELIVERY' ? 'TAKE_AWAY' : (orderType || 'DINE_IN')
);

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const clampMoney = (value, min, max) => Math.min(max, Math.max(min, roundMoney(value)));
const safeTrim = (value, maxLength = 500) => {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};
const buildOrderItemKey = (productId, variantId) => `${productId}:${variantId || 'base'}`;
const normalizeTableKey = (value = '') => String(value || '').trim().toUpperCase();
const isReceiptConflictError = (err) => err?.code === 'P2002'
  && String(err?.meta?.target || '')
    .toLowerCase()
    .includes('receipt');

const orderItemInclude = {
  product: { select: { id: true, name: true } },
  variant: { select: { id: true, name: true } },
};

const orderDetailsInclude = {
  items: {
    orderBy: [
      { orderBatchNumber: 'asc' },
      { id: 'asc' },
    ],
    include: orderItemInclude,
  },
  payments: {
    orderBy: { createdAt: 'desc' },
  },
  cashier: { select: { id: true, name: true } },
  statusHistories: {
    orderBy: { changedAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
  },
  cancellationLogs: {
    orderBy: { cancelledAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
  },
};

const getOrderById = async (db, orderId) => db.order.findUnique({
  where: { id: orderId },
  include: orderDetailsInclude,
});

const getEffectiveBusinessProfile = async (branchId, db = prisma) => {
  const [branchProfile, globalProfile] = await Promise.all([
    db.businessProfile.findFirst({
      where: { branchId },
      orderBy: { updatedAt: 'desc' },
    }),
    db.businessProfile.findFirst({
      where: { branchId: null },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  return branchProfile || globalProfile || null;
};

const getRequesterSummary = async (userId, db = prisma) => {
  if (!userId) return null;
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, branchId: true },
  });
};

const assertRequesterCanManageOrder = (order, requester) => {
  if (!requester || !order) return;

  if (requester.role === 'CASHIER' && order.cashierId !== requester.id) {
    throw new AppError('Kasir hanya bisa mengelola bill miliknya sendiri', 403);
  }

  if (
    ['CASHIER', 'MANAGER'].includes(requester.role)
    && requester.branchId
    && requester.branchId !== order.branchId
  ) {
    throw new AppError('Forbidden: tidak bisa mengakses bill cabang lain', 403);
  }
};

const assertBillIsMutable = (order) => {
  if (!order) throw new AppError('Order tidak ditemukan', 404);

  if (order.payments?.some((payment) => payment.status === 'SUCCESS')) {
    throw new AppError('Bill sudah memiliki pembayaran sukses dan tidak bisa diubah', 422);
  }

  if (!MUTABLE_BILL_STATUSES.has(order.status)) {
    throw new AppError('Bill hanya bisa diubah saat status Draft atau Menunggu Pembayaran', 422);
  }
};

const validateOrderInput = ({ items, note, discountAmount, orderType }) => {
  if (!items || items.length === 0) {
    throw new AppError('Order harus memiliki minimal 1 item', 422);
  }
  if (items.length > MAX_ITEMS) {
    throw new AppError(`Order maksimal ${MAX_ITEMS} jenis item`, 422);
  }

  for (const item of items) {
    if (!item.productId || typeof item.productId !== 'string') {
      throw new AppError('productId tidak valid', 422);
    }
    if (item.variantId !== undefined && item.variantId !== null && typeof item.variantId !== 'string') {
      throw new AppError('variantId tidak valid', 422);
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new AppError('Quantity item tidak valid (harus bilangan bulat positif)', 422);
    }
    if (item.quantity > MAX_QTY_PER_ITEM) {
      throw new AppError(`Quantity melebihi batas maksimum (${MAX_QTY_PER_ITEM})`, 422);
    }

    const itemDiscount = Number(item.discount) || 0;
    if (Number.isNaN(itemDiscount) || itemDiscount < 0) {
      throw new AppError('Diskon item tidak boleh negatif', 422);
    }
    if (item.note && typeof item.note === 'string' && item.note.length > 100) {
      throw new AppError('Catatan item maksimal 100 karakter', 422);
    }
  }

  if (note && typeof note === 'string' && note.length > 500) {
    throw new AppError('Catatan order maksimal 500 karakter', 422);
  }

  if (orderType && !REQUEST_ORDER_TYPES.includes(orderType)) {
    throw new AppError(`orderType tidak valid. Gunakan: ${REQUEST_ORDER_TYPES.join(', ')}`, 422);
  }

  const normalizedDiscount = roundMoney(Number(discountAmount) || 0);
  if (Number.isNaN(normalizedDiscount) || normalizedDiscount < 0) {
    throw new AppError('Diskon order tidak valid', 422);
  }
};

const resolveOrderTable = async ({ db = prisma, branchId, tableNumber, orderType }) => {
  const normalizedTableNumber = safeTrim(tableNumber, 20);
  const normalizedOrderType = normalizeStoredOrderType(orderType);
  if (!normalizedTableNumber || normalizedOrderType !== 'DINE_IN') {
    return {
      tableNumber: normalizedTableNumber,
      tableId: null,
    };
  }

  const table = await db.diningTable.findFirst({
    where: {
      branchId,
      name: {
        equals: normalizedTableNumber,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      status: true,
    },
  });

  if (!table) {
    return {
      tableNumber: normalizedTableNumber,
      tableId: null,
    };
  }

  if (!table.isActive || table.status === 'OUT_OF_SERVICE') {
    throw new AppError(`Meja "${table.name}" sedang tidak aktif`, 422);
  }

  return {
    tableNumber: table.name,
    tableId: table.id,
  };
};

const findActiveBillByTable = async ({
  db = prisma,
  branchId,
  tableNumber,
  excludeOrderId,
}) => {
  const normalizedTableNumber = safeTrim(tableNumber, 20);
  if (!branchId || !normalizedTableNumber) return null;

  return db.order.findFirst({
    where: {
      branchId,
      orderType: 'DINE_IN',
      status: { in: ACTIVE_TABLE_BILL_STATUSES },
      tableNumber: {
        equals: normalizedTableNumber,
        mode: 'insensitive',
      },
      ...(excludeOrderId && { id: { not: excludeOrderId } }),
    },
    select: { id: true },
  });
};

const buildPreparedOrderItems = async ({
  db = prisma,
  branchId,
  items,
  orderBatchNumber = 1,
}) => {
  validateOrderInput({
    items,
    discountAmount: 0,
    orderType: 'DINE_IN',
  });

  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      isActive: true,
      isAvailable: true,
      category: { select: { id: true, name: true } },
    },
  });

  const productMap = Object.fromEntries(products.map((product) => [product.id, product]));
  const missingProductIds = productIds.filter((id) => !productMap[id]);
  if (missingProductIds.length > 0) {
    throw new AppError('Terdapat menu yang tidak ditemukan', 404);
  }

  const normalizedItems = items.map((item) => {
    const product = productMap[item.productId];
    if (!supportsProductVariants(product)) {
      return {
        ...item,
        variantId: null,
      };
    }
    return {
      ...item,
      variantId: item.variantId || null,
    };
  });

  const itemKeys = new Set(
    normalizedItems.map((item) => buildOrderItemKey(item.productId, item.variantId))
  );
  if (itemKeys.size !== normalizedItems.length) {
    throw new AppError('Terdapat menu/varian duplikat dalam order. Gabungkan menjadi satu item.', 422);
  }

  const variantIds = [...new Set(normalizedItems.map((item) => item.variantId).filter(Boolean))];
  const basePriceProductIds = [...new Set(
    normalizedItems
      .filter((item) => !item.variantId)
      .map((item) => item.productId)
  )];

  const [prices, variants, variantPrices] = await Promise.all([
    basePriceProductIds.length
      ? db.price.findMany({
        where: { productId: { in: basePriceProductIds }, branchId },
      })
      : Promise.resolve([]),
    variantIds.length
      ? db.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, name: true, productId: true, isActive: true },
      })
      : Promise.resolve([]),
    variantIds.length
      ? db.variantPrice.findMany({
        where: { variantId: { in: variantIds }, branchId },
      })
      : Promise.resolve([]),
  ]);

  const priceMap = Object.fromEntries(prices.map((price) => [price.productId, price]));
  const variantMap = Object.fromEntries(variants.map((variant) => [variant.id, variant]));
  const variantPriceMap = Object.fromEntries(variantPrices.map((price) => [price.variantId, price]));

  let subtotal = 0;
  const orderItems = normalizedItems.map((item) => {
    const product = productMap[item.productId];
    if (!product.isActive) {
      throw new AppError(`Menu "${product.name}" tidak aktif dan tidak bisa dipesan`, 422);
    }
    if (!product.isAvailable) {
      throw new AppError(`Menu "${product.name}" sedang tidak tersedia`, 422);
    }

    let unitPrice = 0;
    let itemLabel = product.name;

    if (item.variantId) {
      const variant = variantMap[item.variantId];
      if (!variant) {
        throw new AppError('Varian menu tidak ditemukan', 404);
      }
      if (variant.productId !== item.productId) {
        throw new AppError(`Varian "${variant.name}" tidak cocok dengan menu "${product.name}"`, 422);
      }
      if (!variant.isActive) {
        throw new AppError(`Varian "${variant.name}" sedang nonaktif`, 422);
      }

      const variantPrice = variantPriceMap[item.variantId];
      if (!variantPrice) {
        throw new AppError(`Varian "${variant.name}" belum memiliki harga di cabang ini`, 422);
      }

      unitPrice = Number(variantPrice.price);
      itemLabel = `${product.name} (${variant.name})`;
    } else {
      const priceRecord = priceMap[item.productId];
      if (!priceRecord) {
        throw new AppError(`Menu "${product.name}" belum memiliki harga di cabang ini`, 422);
      }
      unitPrice = Number(priceRecord.price);
    }

    const itemDiscount = roundMoney(Number(item.discount) || 0);
    const itemTotal = roundMoney(unitPrice * item.quantity);
    if (itemDiscount > itemTotal) {
      throw new AppError(
        `Diskon item "${itemLabel}" (${itemDiscount}) melebihi total harga item (${itemTotal})`,
        422
      );
    }

    const itemSubtotal = roundMoney(itemTotal - itemDiscount);
    subtotal = roundMoney(subtotal + itemSubtotal);

    return {
      productId: item.productId,
      variantId: item.variantId || null,
      quantity: item.quantity,
      unitPrice,
      discount: itemDiscount,
      subtotal: itemSubtotal,
      note: safeTrim(item.note, 100),
      orderBatchNumber,
      kitchenPrintedAt: null,
    };
  });

  const { items: orderItemsWithHpp, totalHpp } = await calculateOrderHppSnapshot({
    items: orderItems,
    branchId,
    db,
  });

  return {
    items: orderItemsWithHpp.map((item) => ({
      ...item,
      orderBatchNumber,
      kitchenPrintedAt: null,
    })),
    subtotal,
    totalHpp: roundMoney(totalHpp),
  };
};

const calculateOrderTotals = ({
  subtotal,
  discountAmount = 0,
  totalHpp = 0,
  businessProfile,
}) => {
  const normalizedSubtotal = roundMoney(subtotal);
  const normalizedDiscount = clampMoney(discountAmount, 0, normalizedSubtotal);
  const chargeBase = roundMoney(Math.max(0, normalizedSubtotal - normalizedDiscount));
  const taxRate = Number(businessProfile?.taxRate ?? 0);
  const serviceChargeRate = Number(businessProfile?.serviceChargeRate ?? 0);
  const taxAmount = taxRate > 0 ? roundMoney((chargeBase * taxRate) / 100) : 0;
  const serviceCharge = serviceChargeRate > 0 ? roundMoney((chargeBase * serviceChargeRate) / 100) : 0;
  const totalAmount = roundMoney(chargeBase + taxAmount + serviceCharge);

  if (totalAmount < 0) {
    throw new AppError('Total order tidak boleh negatif', 422);
  }

  return {
    subtotal: normalizedSubtotal,
    discountAmount: normalizedDiscount,
    taxAmount,
    serviceCharge,
    hppAmount: roundMoney(totalHpp),
    totalAmount,
  };
};

const expirePendingPaymentsForOrder = async (tx, order, {
  changedBy = null,
  note = null,
  forceResetStatus = false,
} = {}) => {
  if (!order?.id) return;

  await tx.payment.updateMany({
    where: {
      orderId: order.id,
      status: { in: PENDING_PAYMENT_STATUSES },
    },
    data: {
      status: 'EXPIRED',
      expiredAt: new Date(),
    },
  });

  if ((forceResetStatus || order.status === 'PENDING_PAYMENT') && order.status === 'PENDING_PAYMENT') {
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'DRAFT' },
    });

    if (changedBy) {
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING_PAYMENT',
          toStatus: 'DRAFT',
          note: note || 'Bill diubah, status pembayaran dikembalikan ke draft',
          changedBy,
        },
      });
    }
  }
};

const recalculateOrderFinancials = async (tx, orderId, {
  discountAmount,
} = {}) => {
  const currentOrder = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
    },
  });

  if (!currentOrder) throw new AppError('Order tidak ditemukan', 404);

  const subtotal = roundMoney(
    currentOrder.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
  );
  const totalHpp = roundMoney(
    currentOrder.items.reduce((sum, item) => sum + Number(item.hppSubtotal || 0), 0)
  );
  const businessProfile = await getEffectiveBusinessProfile(currentOrder.branchId, tx);

  const totals = calculateOrderTotals({
    subtotal,
    discountAmount: discountAmount ?? Number(currentOrder.discountAmount || 0),
    totalHpp,
    businessProfile,
  });

  await tx.order.update({
    where: { id: orderId },
    data: totals,
  });

  return getOrderById(tx, orderId);
};

const withReceiptRetry = async (handler) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await handler();
    } catch (err) {
      if (isReceiptConflictError(err) && attempt < 2) {
        continue;
      }
      throw err;
    }
  }

  throw new AppError('Gagal membuat nomor antrian. Silakan coba lagi.', 500);
};

const createEmptyBillForTable = async (tx, {
  sourceOrder,
  targetTableNumber,
}) => withReceiptRetry(async () => {
  const resolvedTable = await resolveOrderTable({
    db: tx,
    branchId: sourceOrder.branchId,
    tableNumber: targetTableNumber,
    orderType: 'DINE_IN',
  });
  const { receiptNumber, queueNumber } = await generateReceiptMetadata(sourceOrder.branchId, tx);

  const created = await tx.order.create({
    data: {
      receiptNumber,
      cashierId: sourceOrder.cashierId,
      branchId: sourceOrder.branchId,
      shiftId: sourceOrder.shiftId,
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      serviceCharge: 0,
      hppAmount: 0,
      totalAmount: 0,
      note: safeTrim(`Bill hasil split dari ${sourceOrder.receiptNumber}`, 500),
      tableNumber: resolvedTable.tableNumber || queueNumber,
      tableId: resolvedTable.tableId,
      orderType: 'DINE_IN',
      status: 'DRAFT',
    },
    select: { id: true },
  });

  return getOrderById(tx, created.id);
});

const cancelTransferredOrder = async (tx, {
  order,
  userId,
  reason,
  note = null,
}) => {
  await tx.payment.updateMany({
    where: {
      orderId: order.id,
      status: { in: PENDING_PAYMENT_STATUSES },
    },
    data: {
      status: 'EXPIRED',
      expiredAt: new Date(),
    },
  });

  const cancelled = await tx.order.update({
    where: { id: order.id },
    data: {
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      serviceCharge: 0,
      hppAmount: 0,
      totalAmount: 0,
      cancelReason: reason,
      cancelledAt: new Date(),
      cancelledBy: userId,
      note: safeTrim(note || order.note, 500),
    },
  });

  await tx.orderCancellationLog.create({
    data: {
      orderId: order.id,
      reason,
      note,
      previousStatus: order.status,
      cancelledBy: userId,
    },
  });

  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: 'CANCELLED',
      note: reason,
      changedBy: userId,
    },
  });

  return getOrderById(tx, cancelled.id);
};

const splitSelectionMap = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Minimal 1 item untuk split bill', 422);
  }

  const map = new Map();
  for (const row of items) {
    const orderItemId = safeTrim(row?.orderItemId, 100);
    const quantity = Number(row?.quantity);

    if (!orderItemId) throw new AppError('orderItemId wajib diisi', 422);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError('Quantity split harus bilangan bulat positif', 422);
    }
    if (map.has(orderItemId)) {
      throw new AppError('Terdapat item split duplikat', 422);
    }

    map.set(orderItemId, quantity);
  }

  return map;
};

const splitExistingOrderItem = (item, movedQuantity) => {
  const quantity = Number(item.quantity || 0);
  if (!Number.isInteger(movedQuantity) || movedQuantity <= 0 || movedQuantity > quantity) {
    throw new AppError('Quantity split melebihi quantity item asal', 422);
  }

  const unitPrice = roundMoney(Number(item.unitPrice || 0));
  const totalDiscount = roundMoney(Number(item.discount || 0));
  const totalSubtotal = roundMoney(Number(item.subtotal || 0));
  const totalHppSubtotal = roundMoney(Number(item.hppSubtotal || 0));

  const discountPerQty = quantity > 0 ? totalDiscount / quantity : 0;
  const hppPerQty = quantity > 0 ? totalHppSubtotal / quantity : 0;

  const movedDiscount = roundMoney(discountPerQty * movedQuantity);
  const movedSubtotal = roundMoney((unitPrice * movedQuantity) - movedDiscount);
  const movedHppSubtotal = roundMoney(hppPerQty * movedQuantity);

  const remainingQuantity = quantity - movedQuantity;
  const remainingDiscount = roundMoney(totalDiscount - movedDiscount);
  const remainingSubtotal = roundMoney(totalSubtotal - movedSubtotal);
  const remainingHppSubtotal = roundMoney(totalHppSubtotal - movedHppSubtotal);

  return {
    moved: {
      quantity: movedQuantity,
      unitPrice,
      discount: movedDiscount,
      subtotal: movedSubtotal,
      hppSubtotal: movedHppSubtotal,
      orderBatchNumber: item.orderBatchNumber || 1,
      kitchenPrintedAt: item.kitchenPrintedAt || null,
      note: item.note || null,
      productId: item.productId,
      variantId: item.variantId || null,
    },
    remaining: {
      quantity: remainingQuantity,
      discount: remainingDiscount,
      subtotal: remainingSubtotal,
      hppSubtotal: remainingHppSubtotal,
    },
  };
};

const proportionallySplitDiscount = ({
  totalDiscount,
  movedSubtotal,
  sourceSubtotal,
}) => {
  const normalizedTotalDiscount = roundMoney(totalDiscount);
  const normalizedMovedSubtotal = roundMoney(movedSubtotal);
  const normalizedSourceSubtotal = roundMoney(sourceSubtotal);

  if (normalizedTotalDiscount <= 0 || normalizedMovedSubtotal <= 0 || normalizedSourceSubtotal <= 0) {
    return 0;
  }

  return clampMoney(
    (normalizedTotalDiscount * normalizedMovedSubtotal) / normalizedSourceSubtotal,
    0,
    normalizedTotalDiscount
  );
};

const appendOrderItemsService = async ({
  orderId,
  userId,
  items,
}) => {
  validateOrderInput({
    items,
    discountAmount: 0,
    orderType: 'DINE_IN',
  });

  const [requester, order] = await Promise.all([
    getRequesterSummary(userId),
    getOrderById(prisma, orderId),
  ]);

  if (!order) throw new AppError('Order tidak ditemukan', 404);
  assertRequesterCanManageOrder(order, requester);
  assertBillIsMutable(order);

  const nextBatchNumber = order.items.reduce(
    (max, item) => Math.max(max, Number(item.orderBatchNumber || 1)),
    1
  ) + 1;

  const preparedItems = await buildPreparedOrderItems({
    branchId: order.branchId,
    items,
    orderBatchNumber: nextBatchNumber,
  });

  return prisma.$transaction(async (tx) => {
    await expirePendingPaymentsForOrder(tx, order, {
      changedBy: userId,
      note: 'Bill diubah karena tambah pesanan',
      forceResetStatus: true,
    });

    await tx.orderItem.createMany({
      data: preparedItems.items.map((item) => ({
        orderId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        subtotal: item.subtotal,
        hppSubtotal: item.hppSubtotal,
        note: item.note,
        orderBatchNumber: item.orderBatchNumber,
        kitchenPrintedAt: item.kitchenPrintedAt,
      })),
    });

    return recalculateOrderFinancials(tx, orderId);
  });
};

const markOrderItemsPrintedService = async ({
  orderId,
  userId,
  itemIds,
}) => {
  const [requester, order] = await Promise.all([
    getRequesterSummary(userId),
    getOrderById(prisma, orderId),
  ]);

  if (!order) throw new AppError('Order tidak ditemukan', 404);
  assertRequesterCanManageOrder(order, requester);

  if (['CANCELLED', 'VOID'].includes(order.status)) {
    throw new AppError('Order yang dibatalkan tidak bisa dicetak', 422);
  }

  const requestedItemIds = Array.isArray(itemIds)
    ? [...new Set(itemIds.map((itemId) => safeTrim(itemId, 100)).filter(Boolean))]
    : [];

  const printableItems = order.items.filter((item) => {
    if (item.kitchenPrintedAt) return false;
    if (!requestedItemIds.length) return true;
    return requestedItemIds.includes(item.id);
  });

  if (!printableItems.length) {
    throw new AppError('Tidak ada item order baru yang perlu dicetak', 422);
  }

  return prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({
      where: {
        orderId,
        id: { in: printableItems.map((item) => item.id) },
        kitchenPrintedAt: null,
      },
      data: {
        kitchenPrintedAt: new Date(),
      },
    });

    return getOrderById(tx, orderId);
  });
};

const splitOrderService = async ({
  orderId,
  userId,
  targetTableNumber,
  items,
}) => {
  const selectionMap = splitSelectionMap(items);
  const [requester, sourceOrder] = await Promise.all([
    getRequesterSummary(userId),
    getOrderById(prisma, orderId),
  ]);

  if (!sourceOrder) throw new AppError('Order tidak ditemukan', 404);
  assertRequesterCanManageOrder(sourceOrder, requester);
  assertBillIsMutable(sourceOrder);

  if (sourceOrder.orderType !== 'DINE_IN') {
    throw new AppError('Split bill hanya tersedia untuk order dine in', 422);
  }

  const resolvedTargetTable = await resolveOrderTable({
    branchId: sourceOrder.branchId,
    tableNumber: targetTableNumber,
    orderType: 'DINE_IN',
  });

  const normalizedSourceTable = normalizeTableKey(sourceOrder.tableNumber);
  const normalizedTargetTable = normalizeTableKey(resolvedTargetTable.tableNumber);
  if (!normalizedTargetTable) {
    throw new AppError('Meja tujuan wajib dipilih', 422);
  }
  if (normalizedSourceTable && normalizedSourceTable === normalizedTargetTable) {
    throw new AppError('Meja tujuan harus berbeda dari meja asal', 422);
  }

  const targetReference = await findActiveBillByTable({
    branchId: sourceOrder.branchId,
    tableNumber: resolvedTargetTable.tableNumber,
    excludeOrderId: sourceOrder.id,
  });

  if (targetReference) {
    const targetOrder = await getOrderById(prisma, targetReference.id);
    assertRequesterCanManageOrder(targetOrder, requester);
    assertBillIsMutable(targetOrder);
  }

  const sourceItemsById = new Map(sourceOrder.items.map((item) => [item.id, item]));
  let movedSubtotal = 0;

  for (const [orderItemId, quantity] of selectionMap.entries()) {
    const sourceItem = sourceItemsById.get(orderItemId);
    if (!sourceItem) {
      throw new AppError('Terdapat item split yang tidak ditemukan di bill asal', 404);
    }
    const splitResult = splitExistingOrderItem(sourceItem, quantity);
    movedSubtotal = roundMoney(movedSubtotal + splitResult.moved.subtotal);
  }

  return prisma.$transaction(async (tx) => {
    let targetOrder = targetReference
      ? await getOrderById(tx, targetReference.id)
      : await createEmptyBillForTable(tx, {
        sourceOrder,
        targetTableNumber: resolvedTargetTable.tableNumber,
      });

    await expirePendingPaymentsForOrder(tx, targetOrder, {
      changedBy: userId,
      note: 'Bill diubah karena split bill',
      forceResetStatus: true,
    });

    for (const [orderItemId, quantity] of selectionMap.entries()) {
      const sourceItem = sourceItemsById.get(orderItemId);
      const splitResult = splitExistingOrderItem(sourceItem, quantity);

      await tx.orderItem.create({
        data: {
          orderId: targetOrder.id,
          productId: splitResult.moved.productId,
          variantId: splitResult.moved.variantId,
          quantity: splitResult.moved.quantity,
          unitPrice: splitResult.moved.unitPrice,
          discount: splitResult.moved.discount,
          subtotal: splitResult.moved.subtotal,
          hppSubtotal: splitResult.moved.hppSubtotal,
          note: splitResult.moved.note,
          orderBatchNumber: splitResult.moved.orderBatchNumber,
          kitchenPrintedAt: splitResult.moved.kitchenPrintedAt,
        },
      });

      if (splitResult.remaining.quantity > 0) {
        await tx.orderItem.update({
          where: { id: sourceItem.id },
          data: {
            quantity: splitResult.remaining.quantity,
            discount: splitResult.remaining.discount,
            subtotal: splitResult.remaining.subtotal,
            hppSubtotal: splitResult.remaining.hppSubtotal,
          },
        });
      } else {
        await tx.orderItem.delete({
          where: { id: sourceItem.id },
        });
      }
    }

    const movedOrderDiscount = proportionallySplitDiscount({
      totalDiscount: Number(sourceOrder.discountAmount || 0),
      movedSubtotal,
      sourceSubtotal: Number(sourceOrder.subtotal || 0),
    });

    targetOrder = await recalculateOrderFinancials(tx, targetOrder.id, {
      discountAmount: roundMoney(
        Number(targetOrder.discountAmount || 0) + movedOrderDiscount
      ),
    });

    const remainingSourceItems = await tx.orderItem.count({
      where: { orderId: sourceOrder.id },
    });

    if (remainingSourceItems === 0) {
      const updatedSourceOrder = await cancelTransferredOrder(tx, {
        order: sourceOrder,
        userId,
        reason: `Bill dipisah ke meja ${targetOrder.tableNumber || resolvedTargetTable.tableNumber}`,
        note: `Dipindahkan ke bill ${targetOrder.receiptNumber}`,
      });
      return {
        sourceOrder: updatedSourceOrder,
        targetOrder,
      };
    }

    await expirePendingPaymentsForOrder(tx, sourceOrder, {
      changedBy: userId,
      note: 'Bill diubah karena split bill',
      forceResetStatus: true,
    });

    const updatedSourceOrder = await recalculateOrderFinancials(tx, sourceOrder.id, {
      discountAmount: roundMoney(
        Number(sourceOrder.discountAmount || 0) - movedOrderDiscount
      ),
    });

    return {
      sourceOrder: updatedSourceOrder,
      targetOrder,
    };
  });
};

const mergeOrderService = async ({
  orderId,
  userId,
  targetTableNumber,
}) => {
  const [requester, sourceOrder] = await Promise.all([
    getRequesterSummary(userId),
    getOrderById(prisma, orderId),
  ]);

  if (!sourceOrder) throw new AppError('Order tidak ditemukan', 404);
  assertRequesterCanManageOrder(sourceOrder, requester);
  assertBillIsMutable(sourceOrder);

  if (sourceOrder.orderType !== 'DINE_IN') {
    throw new AppError('Gabung bill hanya tersedia untuk order dine in', 422);
  }

  const resolvedTargetTable = await resolveOrderTable({
    branchId: sourceOrder.branchId,
    tableNumber: targetTableNumber,
    orderType: 'DINE_IN',
  });

  const normalizedSourceTable = normalizeTableKey(sourceOrder.tableNumber);
  const normalizedTargetTable = normalizeTableKey(resolvedTargetTable.tableNumber);
  if (!normalizedTargetTable) {
    throw new AppError('Meja tujuan wajib dipilih', 422);
  }
  if (normalizedSourceTable && normalizedSourceTable === normalizedTargetTable) {
    throw new AppError('Meja tujuan harus berbeda dari meja asal', 422);
  }

  const targetReference = await findActiveBillByTable({
    branchId: sourceOrder.branchId,
    tableNumber: resolvedTargetTable.tableNumber,
    excludeOrderId: sourceOrder.id,
  });
  if (!targetReference) {
    throw new AppError('Bill tujuan di meja tersebut tidak ditemukan', 404);
  }

  const targetOrder = await getOrderById(prisma, targetReference.id);
  assertRequesterCanManageOrder(targetOrder, requester);
  assertBillIsMutable(targetOrder);

  return prisma.$transaction(async (tx) => {
    await expirePendingPaymentsForOrder(tx, targetOrder, {
      changedBy: userId,
      note: 'Bill diubah karena gabung bill',
      forceResetStatus: true,
    });

    await tx.payment.updateMany({
      where: {
        orderId: sourceOrder.id,
        status: { in: PENDING_PAYMENT_STATUSES },
      },
      data: {
        status: 'EXPIRED',
        expiredAt: new Date(),
      },
    });

    if (sourceOrder.items.length > 0) {
      await tx.orderItem.createMany({
        data: sourceOrder.items.map((item) => ({
          orderId: targetOrder.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          subtotal: item.subtotal,
          hppSubtotal: item.hppSubtotal,
          note: item.note,
          orderBatchNumber: item.orderBatchNumber || 1,
          kitchenPrintedAt: item.kitchenPrintedAt || null,
        })),
      });

      await tx.orderItem.deleteMany({
        where: { orderId: sourceOrder.id },
      });
    }

    const updatedTargetOrder = await recalculateOrderFinancials(tx, targetOrder.id, {
      discountAmount: roundMoney(
        Number(targetOrder.discountAmount || 0) + Number(sourceOrder.discountAmount || 0)
      ),
    });

    const updatedSourceOrder = await cancelTransferredOrder(tx, {
      order: sourceOrder,
      userId,
      reason: `Bill digabung ke meja ${updatedTargetOrder.tableNumber || resolvedTargetTable.tableNumber}`,
      note: `Digabung ke bill ${updatedTargetOrder.receiptNumber}`,
    });

    return {
      sourceOrder: updatedSourceOrder,
      targetOrder: updatedTargetOrder,
    };
  });
};

module.exports = {
  appendOrderItemsService,
  markOrderItemsPrintedService,
  splitOrderService,
  mergeOrderService,
};
