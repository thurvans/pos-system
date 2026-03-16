const { z } = require('zod');
const {
  createOrderService,
  getOrderService,
  cancelOrderService,
  completeOrderService,
  listOrdersService,
  getBestSellersService,
  getHourlySalesService,
  getOrderCancellationLogsService,
} = require('./order.service');
const { serializeOrder } = require('../../utils/serializers');

const idSchema = z.string().uuid('ID tidak valid');

// ─── Create Order ─────────────────────────────────────────────
const createOrder = async (req, res, next) => {
  try {
    const body = z.object({
      branchId:      idSchema,
      shiftId:       idSchema.optional(),
      clientOrderId: z.string().optional(),

      items: z.array(z.object({
        productId: idSchema,
        variantId: idSchema.optional(),
        quantity:  z.number().int().positive('Quantity harus positif'),
        discount:  z.number().min(0).optional().default(0),
        note:      z.string().max(100, 'Catatan item maks 100 karakter').optional(),
      })).min(1, 'Minimal 1 item'),

      discountAmount: z.number().min(0).optional().default(0),
      note:           z.string().max(500, 'Catatan order maks 500 karakter').optional(),
      queueNumber:    z.string().max(20).optional(),
      tableNumber:    z.string().max(20).optional(),
      orderType:      z.enum(['DINE_IN', 'TAKE_AWAY', 'DELIVERY']).optional().default('DINE_IN'),
    }).parse(req.body);

    const order = await createOrderService({
      cashierId:      req.user.id,
      branchId:       body.branchId,
      shiftId:        body.shiftId,
      clientOrderId:  body.clientOrderId,
      items:          body.items,
      discountAmount: body.discountAmount,
      note:           body.note,
      tableNumber:    body.queueNumber ?? body.tableNumber,
      orderType:      body.orderType,
    });

    res.status(201).json(serializeOrder(order));
  } catch (err) {
    next(err);
  }
};

// ─── Get Order ────────────────────────────────────────────────
const getOrder = async (req, res, next) => {
  try {
    const order = await getOrderService(req.params.id);
    res.json(serializeOrder(order));
  } catch (err) {
    next(err);
  }
};

// ─── Cancel Order ─────────────────────────────────────────────
const cancelOrder = async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const order = await cancelOrderService({
      orderId: req.params.id,
      userId:  req.user.id,
      reason,
    });
    res.json(serializeOrder(order));
  } catch (err) {
    next(err);
  }
};

// --- Complete order
const completeOrder = async (req, res, next) => {
  try {
    const order = await completeOrderService({
      orderId: req.params.id,
      userId: req.user.id,
    });
    res.json(serializeOrder(order));
  } catch (err) {
    next(err);
  }
};

// ─── List Orders ──────────────────────────────────────────────
const listOrders = async (req, res, next) => {
  try {
    const result = await listOrdersService({
      branchId:    req.query.branch_id || req.branchId,
      status:      req.query.status,
      dateFrom:    req.query.date_from,
      dateTo:      req.query.date_to,
      tableNumber: req.query.queue_number || req.query.table_number,
      orderType:   req.query.order_type,
      cashierId:   req.query.cashier_id,
      page:        Number(req.query.page)  || 1,
      limit:       Number(req.query.limit) || 20,
    });
    res.json({ ...result, data: result.data.map(serializeOrder) });
  } catch (err) {
    next(err);
  }
};

// ─── Best Sellers ─────────────────────────────────────────────
const getBestSellers = async (req, res, next) => {
  try {
    const result = await getBestSellersService({
      branchId: req.query.branch_id,
      dateFrom: req.query.date_from,
      dateTo:   req.query.date_to,
      limit:    req.query.limit,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
};

// ─── Hourly Sales ─────────────────────────────────────────────
const getHourlySales = async (req, res, next) => {
  try {
    const result = await getHourlySalesService({
      branchId: req.query.branch_id,
      date:     req.query.date,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// --- Cancellation logs
const listOrderCancellationLogs = async (req, res, next) => {
  try {
    const logs = await getOrderCancellationLogsService(req.params.id);
    res.json({
      data: logs.map((log) => ({
        id: log.id,
        order_id: log.orderId,
        reason: log.reason,
        note: log.note,
        previous_status: log.previousStatus,
        cancelled_at: log.cancelledAt?.toISOString(),
        cancelled_by: log.cancelledBy,
        user: log.user,
      })),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createOrder,
  getOrder,
  cancelOrder,
  completeOrder,
  listOrders,
  getBestSellers,
  getHourlySales,
  listOrderCancellationLogs,
};
