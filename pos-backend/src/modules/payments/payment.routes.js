const express = require('express');

const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const {
  createPaymentIntent,
  handleWebhook,
  getPaymentStatus,
  simulatePayment,
  refundPayment,
} = require('./payment.controller');

// Webhook tidak perlu auth karena dipanggil oleh Midtrans
router.post('/webhook/:provider', handleWebhook);

router.use(authenticate);

router.post('/intents', createPaymentIntent);
router.get('/:id/status', getPaymentStatus);
router.post('/:id/simulate', simulatePayment);
router.post('/:id/refund', authorize('MANAGER', 'SUPER_ADMIN'), refundPayment);

module.exports = router;
