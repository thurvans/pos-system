const prisma = require('../../config/prisma');
const { AppError } = require('../../utils/errors');
const { calculateOrderHppSnapshot } = require('../../utils/hpp');
const { generateReceiptMetadata } = require('../../utils/receipt');
const { supportsProductVariants } = require('../../utils/productVariantPolicy');
const {
  toBusinessDate,
  toBusinessDateKey,
  buildBusinessDateRange,
} = require('../../utils/businessDate');

const MAX_ITEMS = 50;
const MAX_QTY_PER_ITEM = 999;
const REQUEST_ORDER_TYPES = ['DINE_IN', 'TAKE_AWAY', 'DELIVERY'];
const REVENUE_ORDER_STATUSES = ['PAID'];
const PAID_LIKE_ORDER_STATUSES = new Set(['PAID', 'FULFILLED']);
const ACTIVE_TABLE_BILL_STATUSES = ['DRAFT', 'PENDING_PAYMENT'];
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const normalizeStoredOrderType = (orderType) => (
  orderType === 'DELIVERY' ? 'TAKE_AWAY' : (orderType || 'DINE_IN')
);

const buildOrderItemKey = (productId, variantId) => `${productId}:${variantId || 'base'}`;
const isReceiptConflictError = (err) => err?.code === 'P2002'
  && String(err?.meta?.target || '')
    .toLowerCase()
    .includes('receipt');

const getEffectiveBusinessProfile = async (branchId) => {
  const [branchProfile, globalProfile] = await Promise.all([
    prisma.businessProfile.findFirst({
      where: { branchId },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.businessProfile.findFirst({
      where: { branchId: null },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  return branchProfile || globalProfile || null;
};

const createOrderService = async ({
  cashierId,
  branchId,
  shiftId,
  items,
  discountAmount = 0,
  note,
  clientOrderId,
  tableNumber,
  orderType = 'DINE_IN',
}) => {
  if (clientOrderId) {
    const existing = await prisma.order.findUnique({
      where: { clientOrderId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, name: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (existing) return existing;
  }

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
    if (item.variantId !== undefined && typeof item.variantId !== 'string') {
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

  const normalizedOrderType = normalizeStoredOrderType(orderType);

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new AppError('Cabang tidak ditemukan', 404);
  if (!branch.isActive) throw new AppError('Cabang tidak aktif', 422);

  const normalizedTableNumber = typeof tableNumber === 'string'
    ? tableNumber.trim().slice(0, 20)
    : '';
  let resolvedTableNumber = normalizedTableNumber || null;
  let resolvedTableId = null;

  if (normalizedOrderType === 'DINE_IN' && resolvedTableNumber) {
    const diningTable = await prisma.diningTable.findFirst({
      where: {
        branchId,
        name: {
          equals: resolvedTableNumber,
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

    if (diningTable) {
      if (!diningTable.isActive || diningTable.status === 'OUT_OF_SERVICE') {
        throw new AppError(`Meja "${diningTable.name}" sedang tidak aktif`, 422);
      }
      resolvedTableNumber = diningTable.name;
      resolvedTableId = diningTable.id;
    }

    const activeBill = await prisma.order.findFirst({
      where: {
        branchId,
        orderType: 'DINE_IN',
        status: { in: ACTIVE_TABLE_BILL_STATUSES },
        tableNumber: {
          equals: resolvedTableNumber,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        receiptNumber: true,
      },
    });

    if (activeBill) {
      throw new AppError(
        `Meja ${resolvedTableNumber} masih memiliki bill aktif (${activeBill.receiptNumber}). Gunakan tambah pesanan pada bill tersebut.`,
        409
      );
    }
  }

  const businessProfile = await getEffectiveBusinessProfile(branchId);

  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
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

  const itemKeys = new Set(normalizedItems.map((item) => buildOrderItemKey(item.productId, item.variantId)));
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
      ? prisma.price.findMany({
        where: { productId: { in: basePriceProductIds }, branchId },
      })
      : Promise.resolve([]),
    variantIds.length
      ? prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, name: true, productId: true, isActive: true },
      })
      : Promise.resolve([]),
    variantIds.length
      ? prisma.variantPrice.findMany({
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

    const itemDiscount = Number(item.discount) || 0;
    const itemTotal = unitPrice * item.quantity;
    if (itemDiscount > itemTotal) {
      throw new AppError(
        `Diskon item "${itemLabel}" (${itemDiscount}) melebihi total harga item (${itemTotal})`,
        422
      );
    }

    const itemSubtotal = itemTotal - itemDiscount;
    subtotal += itemSubtotal;

    return {
      productId: item.productId,
      variantId: item.variantId || null,
      quantity: item.quantity,
      unitPrice,
      discount: itemDiscount,
      subtotal: itemSubtotal,
      note: item.note ? String(item.note).slice(0, 200) : null,
    };
  });

  const { items: orderItemsWithHpp, totalHpp } = await calculateOrderHppSnapshot({
    items: orderItems,
    branchId,
    db: prisma,
  });

  const preparedOrderItems = orderItemsWithHpp.map((item) => ({
    ...item,
    orderBatchNumber: 1,
    kitchenPrintedAt: null,
  }));

  const orderDiscount = Math.round(Number(discountAmount) * 100) / 100;
  if (Number.isNaN(orderDiscount) || orderDiscount < 0) {
    throw new AppError('Diskon order tidak valid', 422);
  }
  if (orderDiscount > subtotal) {
    throw new AppError(`Diskon order (${orderDiscount.toLocaleString('id-ID')}) melebihi subtotal (${subtotal.toLocaleString('id-ID')})`, 422);
  }

  const chargeBase = roundMoney(Math.max(0, subtotal - orderDiscount));
  const taxRate = Number(businessProfile?.taxRate ?? 0);
  const serviceChargeRate = Number(businessProfile?.serviceChargeRate ?? 0);
  const taxAmount = taxRate > 0 ? roundMoney((chargeBase * taxRate) / 100) : 0;
  const serviceCharge = serviceChargeRate > 0 ? roundMoney((chargeBase * serviceChargeRate) / 100) : 0;
  const totalAmount = roundMoney(chargeBase + taxAmount + serviceCharge);
  if (totalAmount < 0) {
    throw new AppError('Total order tidak boleh negatif', 422);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const { receiptNumber, queueNumber } = await generateReceiptMetadata(branchId, tx);

        return tx.order.create({
          data: {
            receiptNumber,
            clientOrderId,
            cashierId,
            branchId,
            shiftId,
            subtotal,
            discountAmount: orderDiscount,
            taxAmount,
            serviceCharge,
            hppAmount: totalHpp,
            totalAmount,
            note: note ? String(note).slice(0, 500) : null,
            tableNumber: resolvedTableNumber || queueNumber,
            tableId: resolvedTableId,
            orderType: normalizedOrderType,
            status: 'DRAFT',
            items: {
              create: preparedOrderItems,
            },
          },
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true } },
                variant: { select: { id: true, name: true } },
              },
            },
            payments: true,
          },
        });
      });

      return order;
    } catch (err) {
      if (isReceiptConflictError(err) && attempt < 2) {
        continue;
      }
      throw err;
    }
  }

  throw new AppError('Gagal membuat nomor antrian. Silakan coba lagi.', 500);
};

const getOrderService = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true } },
          variant: { select: { id: true, name: true } },
        },
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
    },
  });
  if (!order) throw new AppError('Order tidak ditemukan', 404);
  return order;
};

const listOrdersService = async ({
  branchId,
  status,
  dateFrom,
  dateTo,
  page = 1,
  limit = 20,
  tableNumber,
  orderType,
  cashierId,
}) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const normalizedStatus = status === 'FULFILLED' ? 'PAID' : status;
  const normalizedOrderType = orderType ? normalizeStoredOrderType(orderType) : undefined;

  const createdAt = buildBusinessDateRange({ dateFrom, dateTo });
  const where = {
    ...(branchId && { branchId }),
    ...(normalizedStatus && { status: normalizedStatus }),
    ...(tableNumber && { tableNumber }),
    ...(normalizedOrderType && { orderType: normalizedOrderType }),
    ...(cashierId && { cashierId }),
    ...(createdAt && { createdAt }),
  };

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: (parsedPage - 1) * parsedLimit,
      take: parsedLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, name: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        cashier: { select: { id: true, name: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data,
    meta: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

const cancelOrderService = async ({ orderId, userId, reason }) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!order) throw new AppError('Order tidak ditemukan', 404);

  if (PAID_LIKE_ORDER_STATUSES.has(order.status) || order.status === 'VOID') {
    throw new AppError(
      `Order dengan status "${order.status === 'FULFILLED' ? 'PAID' : order.status}" tidak dapat dibatalkan. Gunakan fitur refund untuk order yang sudah dibayar.`,
      422
    );
  }

  if (order.status === 'CANCELLED') {
    throw new AppError('Order sudah dibatalkan sebelumnya', 422);
  }

  if (order.payments?.some((payment) => payment.status === 'SUCCESS')) {
    throw new AppError('Order sudah memiliki pembayaran sukses. Gunakan fitur refund.', 422);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === 'CASHIER' && order.cashierId !== userId) {
    throw new AppError('Kasir hanya bisa membatalkan order miliknya sendiri', 403);
  }

  return prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: {
        orderId,
        status: { in: ['INITIATED', 'PENDING'] },
      },
      data: {
        status: 'EXPIRED',
        expiredAt: new Date(),
      },
    });

    const cancelled = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelReason: reason || null,
        cancelledAt: new Date(),
        cancelledBy: userId,
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, name: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    await tx.orderCancellationLog.create({
      data: {
        orderId,
        reason: reason || 'Tanpa alasan',
        previousStatus: order.status,
        cancelledBy: userId,
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: 'CANCELLED',
        note: reason || null,
        changedBy: userId,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'ORDER_CANCEL',
        entity: 'orders',
        entityId: orderId,
        userId,
        oldData: { status: order.status },
        newData: { status: 'CANCELLED', reason: reason || null },
      },
    });

    return cancelled;
  });
};

const completeOrderService = async ({ orderId, userId }) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!order) throw new AppError('Order tidak ditemukan', 404);

  if (['CANCELLED', 'VOID'].includes(order.status)) {
    throw new AppError('Order dibatalkan/void tidak bisa difinalkan', 422);
  }
  if (!PAID_LIKE_ORDER_STATUSES.has(order.status)) {
    throw new AppError('Order harus berstatus Lunas sebelum difinalkan', 422);
  }

  if (order.status === 'PAID') {
    return order;
  }

  const normalized = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, name: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'ORDER_COMPLETE_COMPAT',
        entity: 'orders',
        entityId: order.id,
        userId,
        oldData: { status: order.status },
        newData: { status: 'PAID' },
      },
    });

    return updated;
  });

  return normalized;
};

const getBestSellersService = async ({ branchId, dateFrom, dateTo, limit = 10 }) => {
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const createdAt = buildBusinessDateRange({ dateFrom, dateTo });

  const orderWhere = {
    status: { in: REVENUE_ORDER_STATUSES },
    ...(branchId && { branchId }),
    ...(createdAt && { createdAt }),
  };

  const topItems = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { order: orderWhere },
    _sum: { quantity: true, subtotal: true },
    _count: { id: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: parsedLimit,
  });

  const productIds = topItems.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true, imageUrl: true },
  });
  const productMap = Object.fromEntries(products.map((product) => [product.id, product]));

  return topItems.map((item, idx) => ({
    rank: idx + 1,
    product: productMap[item.productId] ?? null,
    totalQty: item._sum.quantity ?? 0,
    totalRevenue: Number(item._sum.subtotal ?? 0),
    orderCount: item._count.id,
  }));
};

const getHourlySalesService = async ({ branchId, date }) => {
  const targetDate = date || toBusinessDateKey();
  const createdAt = buildBusinessDateRange({ dateFrom: targetDate, dateTo: targetDate });

  const orders = await prisma.order.findMany({
    where: {
      status: { in: REVENUE_ORDER_STATUSES },
      ...(branchId && { branchId }),
      ...(createdAt && { createdAt }),
    },
    select: { createdAt: true, totalAmount: true },
  });

  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    orders: 0,
    revenue: 0,
  }));

  for (const order of orders) {
    const hour = toBusinessDate(order.createdAt).getUTCHours();
    byHour[hour].orders += 1;
    byHour[hour].revenue += Number(order.totalAmount);
  }

  const peakHour = byHour.reduce((max, row) => (row.orders > max.orders ? row : max), byHour[0]);

  return {
    date: targetDate,
    branchId: branchId || 'all',
    byHour,
    peakHour,
    totalOrders: orders.length,
  };
};

const getOrderCancellationLogsService = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true },
  });
  if (!order) throw new AppError('Order tidak ditemukan', 404);

  const logs = await prisma.orderCancellationLog.findMany({
    where: { orderId },
    orderBy: { cancelledAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  return logs.map((log) => ({
    id: log.id,
    orderId: log.orderId,
    reason: log.reason,
    note: log.note,
    previousStatus: log.previousStatus,
    cancelledAt: log.cancelledAt,
    cancelledBy: log.cancelledBy,
    user: log.user || null,
  }));
};

module.exports = {
  createOrderService,
  getOrderService,
  listOrdersService,
  cancelOrderService,
  completeOrderService,
  getBestSellersService,
  getHourlySalesService,
  getOrderCancellationLogsService,
};
