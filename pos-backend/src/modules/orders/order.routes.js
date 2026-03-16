const express = require('express');
const { authenticate, authorize, requireBranchAccess } = require('../../middleware/auth');
const {
  createOrder,
  getOrder,
  cancelOrder,
  completeOrder,
  listOrders,
  getBestSellers,
  getHourlySales,
  listOrderCancellationLogs,
} = require('./order.controller');
const { listRefundsByOrder } = require('../payments/refund.controller');

const router = express.Router();

router.use(authenticate);

router.post('/', requireBranchAccess(), createOrder);
router.get('/', requireBranchAccess(), listOrders);

// Keep static paths above "/:id".
router.get('/best-sellers', getBestSellers);
router.get('/hourly-sales', getHourlySales);

router.get('/:id/cancellation-logs', authorize('MANAGER', 'SUPER_ADMIN'), listOrderCancellationLogs);

// CASHIER can cancel only own order (validated in service).
router.post('/:id/cancel', cancelOrder);
router.post('/:id/complete', authorize('CASHIER'), completeOrder);

router.get('/:id', getOrder);

// Refunds
router.get('/:orderId/refunds', authorize('MANAGER', 'SUPER_ADMIN'), listRefundsByOrder);

module.exports = router;
