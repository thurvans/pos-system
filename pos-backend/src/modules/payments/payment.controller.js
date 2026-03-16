const { z } = require('zod');
const {
  createPaymentIntentService,
  handleWebhookService,
  checkPaymentStatus,
  simulatePaymentService,
} = require('./payment.service');
const { serializePayment } = require('../../utils/serializers');
const logger = require('../../config/logger');

const idSchema = z.string().min(1);
const PAYMENT_METHOD_ALIASES = {
  CASH: 'CASH',
  QRIS: 'QRIS',
  QRCODE: 'QRIS',
  CARD: 'CARD',
  DEBIT: 'CARD',
  CREDIT: 'CARD',
};

const normalizePaymentMethod = (value) => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return PAYMENT_METHOD_ALIASES[normalized] || null;
};

const paymentMethodSchema = z
  .string()
  .min(1)
  .transform(normalizePaymentMethod)
  .refine((value) => Boolean(value), {
    message: 'method harus CASH, QRIS, CARD, DEBIT, atau CREDIT',
  });

const paymentIntentSchema = z.object({
  orderId: idSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{8,80}$/, 'idempotencyKey minimal 8 karakter, hanya huruf/angka/:-_'),
  customerName: z.string().min(2).max(80).optional(),
  method: paymentMethodSchema,
});

const createPaymentIntent = async (req, res, next) => {
  try {
    const body = paymentIntentSchema.parse(req.body);

    const payment = await createPaymentIntentService({
      orderId: body.orderId,
      idempotencyKey: body.idempotencyKey,
      customerName: body.customerName,
      method: body.method,
      requester: req.user,
    });

    res.status(201).json(serializePayment(payment));
  } catch (err) {
    next(err);
  }
};

const handleWebhook = async (req, res, next) => {
  try {
    const provider = String(req.params.provider || '').trim().toLowerCase();
    if (provider !== 'midtrans') {
      return res.status(404).json({ error: 'Provider webhook tidak didukung' });
    }

    const result = await handleWebhookService({ rawBody: req.body, headers: req.headers });
    res.json(result);
  } catch (err) {
    logger.error('Webhook error:', err.message);
    // Selalu return 200 agar gateway tidak terus retry saat payload invalid/duplikat.
    res.json({ received: true });
  }
};

const getPaymentStatus = async (req, res, next) => {
  try {
    const payment = await checkPaymentStatus(req.params.id);
    res.json(serializePayment(payment));
  } catch (err) {
    next(err);
  }
};

const simulatePayment = async (req, res, next) => {
  try {
    const paymentId = idSchema.parse(req.params.id);
    const payment = await simulatePaymentService(paymentId);
    res.json(serializePayment(payment));
  } catch (err) {
    next(err);
  }
};

const refundPayment = async (req, res, next) => {
  try {
    const { requestRefundService } = require('./refund.service');
    const { amount, reason } = z.object({
      amount: z.number().positive(),
      reason: z.string().min(3),
    }).parse(req.body);

    const refund = await requestRefundService({
      paymentId: req.params.id,
      amount,
      reason,
      requestedBy: req.user.id,
    });
    res.status(201).json(refund);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createPaymentIntent,
  handleWebhook,
  getPaymentStatus,
  simulatePayment,
  refundPayment,
};
