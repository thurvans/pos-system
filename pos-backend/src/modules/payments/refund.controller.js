// refund.controller.js
const { z } = require('zod');
const {
  requestRefundService,
  getRefundsByOrder,
  getRefund,
  checkRefundStatus,
} = require('./refund.service');

const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive('Amount harus lebih dari 0'),
  reason: z.string().min(3, 'Alasan minimal 3 karakter').max(255),
});

// POST /refunds
const createRefund = async (req, res, next) => {
  try {
    const body = refundSchema.parse(req.body);
    const refund = await requestRefundService({
      ...body,
      requestedBy: req.user.id,
    });
    res.status(201).json(refund);
  } catch (err) {
    next(err);
  }
};

// GET /refunds/:id
const getOneRefund = async (req, res, next) => {
  try {
    const refund = await getRefund(req.params.id);
    res.json(refund);
  } catch (err) {
    next(err);
  }
};

// GET /refunds/:id/status  — poll dari gateway
const pollRefundStatus = async (req, res, next) => {
  try {
    const refund = await checkRefundStatus(req.params.id);
    res.json(refund);
  } catch (err) {
    next(err);
  }
};

// GET /orders/:orderId/refunds
const listRefundsByOrder = async (req, res, next) => {
  try {
    const refunds = await getRefundsByOrder(req.params.orderId);
    res.json(refunds);
  } catch (err) {
    next(err);
  }
};

module.exports = { createRefund, getOneRefund, pollRefundStatus, listRefundsByOrder };
