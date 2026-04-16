/**
 * Serializers — normalize Prisma camelCase → snake_case / consistent fields
 * agar Flutter model.fromJson() bisa parse tanpa error.
 *
 * Rules:
 * - Semua Date → ISO string
 * - Semua Decimal → Number
 * - Nullable fields → null (bukan undefined)
 */

// ─── Payment ────────────────────────────────────────────────

const serializePayment = (p) => {
  if (!p) return null;

  const meta = p.meta || {};
  const environment = meta.environment ?? null;
  const testMode = meta.testMode === true || environment === 'development';
  const canSimulate = meta.canSimulate === true
    && ['QRIS'].includes(String(p.method || '').toUpperCase())
    && ['INITIATED', 'PENDING'].includes(String(p.status || '').toUpperCase());

  return {
    id: p.id,
    order_id: p.orderId,          // Flutter: order_id
    method: p.method,
    status: p.status,
    amount: Number(p.amount),
    // QRIS — qr_payload (Flutter cek qr_payload || qrPayload || qrString)
    qr_payload: p.qrPayload ?? p.qrString ?? meta.qrString ?? null,
    qrPayload: p.qrPayload ?? p.qrString ?? meta.qrString ?? null, // alias
    qrString: p.qrPayload ?? p.qrString ?? meta.qrString ?? null,  // alias
    qr_image_url: p.qrImageUrl ?? meta.qrImageUrl ?? null,
    qrImageUrl: p.qrImageUrl ?? meta.qrImageUrl ?? null,
    // Gateway
    gateway_ref: p.gatewayRef ?? null,
    gatewayRef: p.gatewayRef ?? null,
    // Timestamps
    expired_at: p.expiredAt?.toISOString() ?? p.expiresAt?.toISOString() ?? null,
    expiredAt: p.expiredAt?.toISOString() ?? p.expiresAt?.toISOString() ?? null,
    paid_at: p.paidAt?.toISOString() ?? null,
    created_at: p.createdAt?.toISOString() ?? null,
    // VA fields — dari meta atau root (payment.service.js return keduanya)
    bankCode: p.bankCode ?? meta.bankCode ?? null,
    bank_code: p.bankCode ?? meta.bankCode ?? null,
    accountNumber: p.accountNumber ?? meta.accountNumber ?? null,
    account_number: p.accountNumber ?? meta.accountNumber ?? null,
    environment,
    test_mode: testMode,
    testMode,
    can_simulate: canSimulate,
    canSimulate,
    // eWallet fields
    checkoutUrl: p.checkoutUrl ?? meta.checkoutUrl ?? null,
    mobileDeeplink: p.mobileDeeplink ?? meta.mobileDeeplink ?? null,
    // Raw meta (optional, untuk debugging)
    meta: typeof meta === 'object' ? meta : {},
  };
};

// ─── Order ───────────────────────────────────────────────────

const normalizeOrderStatus = (status) => (
  status === 'FULFILLED' ? 'PAID' : status
);

const serializeOrder = (o) => {
  if (!o) return null;
  const unprintedOrderItems = (o.items ?? []).filter((item) => !item.kitchenPrintedAt);
  return {
    id: o.id,
    receipt_number: o.receiptNumber,
    receiptNumber: o.receiptNumber,       // alias
    status: normalizeOrderStatus(o.status),
    fulfillment_status: o.fulfillmentStatus ?? 'PENDING',
    fulfillmentStatus: o.fulfillmentStatus ?? 'PENDING',
    subtotal: Number(o.subtotal),
    discount_amount: Number(o.discountAmount ?? 0),
    discountAmount: Number(o.discountAmount ?? 0),
    tax_amount: Number(o.taxAmount ?? 0),
    taxAmount: Number(o.taxAmount ?? 0),
    service_charge: Number(o.serviceCharge ?? 0),
    serviceCharge: Number(o.serviceCharge ?? 0),
    total_amount: Number(o.totalAmount),
    totalAmount: Number(o.totalAmount),
    queue_number: o.tableNumber ?? null,
    queueNumber: o.tableNumber ?? null,
    table_number: o.tableNumber ?? null,
    tableNumber: o.tableNumber ?? null,
    table_id: o.tableId ?? null,
    tableId: o.tableId ?? null,
    order_type: o.orderType ?? 'DINE_IN',
    orderType: o.orderType ?? 'DINE_IN',
    note: o.note ?? null,
    cancel_reason: o.cancelReason ?? null,
    cancelReason: o.cancelReason ?? null,
    cancelled_at: o.cancelledAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    cancelled_by: o.cancelledBy ?? null,
    cancelledBy: o.cancelledBy ?? null,
    client_order_id: o.clientOrderId ?? null,
    clientOrderId: o.clientOrderId ?? null,
    branch_id: o.branchId,
    cashier_id: o.cashierId,
    shift_id: o.shiftId ?? null,
    created_at: o.createdAt?.toISOString(),
    createdAt: o.createdAt?.toISOString(),
    has_unprinted_order_items: unprintedOrderItems.length > 0,
    hasUnprintedOrderItems: unprintedOrderItems.length > 0,
    unprinted_order_items_count: unprintedOrderItems.length,
    unprintedOrderItemsCount: unprintedOrderItems.length,
    cashier: o.cashier ?? null,
    items: (o.items ?? []).map(serializeOrderItem),
    payments: (o.payments ?? []).map(serializePayment),
    status_histories: (o.statusHistories ?? []).map((history) => ({
      id: history.id,
      from_status: normalizeOrderStatus(history.fromStatus) ?? null,
      to_status: normalizeOrderStatus(history.toStatus),
      note: history.note ?? null,
      changed_at: history.changedAt?.toISOString() ?? null,
      changed_by: history.changedBy ?? null,
      user: history.user ?? null,
    })),
    cancellation_logs: (o.cancellationLogs ?? []).map((log) => ({
      id: log.id,
      reason: log.reason,
      note: log.note ?? null,
      previous_status: normalizeOrderStatus(log.previousStatus),
      cancelled_at: log.cancelledAt?.toISOString() ?? null,
      cancelled_by: log.cancelledBy ?? null,
      user: log.user ?? null,
    })),
  };
};

const serializeOrderItem = (i) => {
  const displayName = i.variant?.name
    ? `${i.product?.name || ''} (${i.variant.name})`
    : (i.product?.name || '');

  return {
    id: i.id,
    product_id: i.productId,
    productId: i.productId,
    variant_id: i.variantId ?? null,
    variantId: i.variantId ?? null,
    product_name: displayName || null,
    productName: displayName || null,
    product: i.product ? { id: i.product.id, name: i.product.name } : null,
    variant: i.variant ? { id: i.variant.id, name: i.variant.name } : null,
    quantity: i.quantity,
    unit_price: Number(i.unitPrice),
    unitPrice: Number(i.unitPrice),
    discount: Number(i.discount ?? 0),
    subtotal: Number(i.subtotal),
    hpp_subtotal: Number(i.hppSubtotal ?? 0),
    hppSubtotal: Number(i.hppSubtotal ?? 0),
    note: i.note ?? null,
    order_batch_number: i.orderBatchNumber ?? 1,
    orderBatchNumber: i.orderBatchNumber ?? 1,
    kitchen_printed_at: i.kitchenPrintedAt?.toISOString?.() ?? null,
    kitchenPrintedAt: i.kitchenPrintedAt?.toISOString?.() ?? null,
  };
};

// ─── Shift ───────────────────────────────────────────────────

const serializeShift = (s) => {
  if (!s) return null;
  return {
    id: s.id,
    user_id: s.userId,
    userId: s.userId,
    branch_id: s.branchId,
    branchId: s.branchId,
    status: s.status,
    opening_cash: Number(s.openingCash),
    openingCash: Number(s.openingCash),
    closing_cash: s.closingCash != null ? Number(s.closingCash) : null,
    closingCash: s.closingCash != null ? Number(s.closingCash) : null,
    opened_at: s.openedAt?.toISOString(),
    openedAt: s.openedAt?.toISOString(),
    closed_at: s.closedAt?.toISOString() ?? null,
    closedAt: s.closedAt?.toISOString() ?? null,
    user: s.user ?? null,
    branch: s.branch ?? null,
    orderCount: s._count?.orders ?? 0,
  };
};

// ─── Branch ──────────────────────────────────────────────────

const serializeBranch = (b) => ({
  id: b.id,
  name: b.name,
  address: b.address ?? null,
  phone: b.phone ?? null,
  is_active: b.isActive ?? true,
});

module.exports = { serializePayment, serializeOrder, serializeOrderItem, serializeShift, serializeBranch };
