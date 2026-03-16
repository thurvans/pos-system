const crypto = require('crypto');
const logger = require('../../../config/logger');
const { AppError } = require('../../../utils/errors');

const DEFAULT_RETRY_COUNT = Number(process.env.MIDTRANS_HTTP_MAX_RETRIES || 2);
const DEFAULT_RETRY_DELAY_MS = Number(process.env.MIDTRANS_HTTP_RETRY_DELAY_MS || 400);
const DEFAULT_QRIS_ACQUIRER = String(process.env.MIDTRANS_QRIS_ACQUIRER || 'gopay').trim().toLowerCase() || 'gopay';
const DEFAULT_QRIS_EXPIRY_MINUTES = Number(process.env.MIDTRANS_QRIS_EXPIRY_MINUTES || 15);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeValue = (value) =>
  String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');

const getServerKey = () => {
  const serverKey = normalizeValue(process.env.MIDTRANS_SERVER_KEY);
  if (!serverKey) throw new AppError('MIDTRANS_SERVER_KEY belum dikonfigurasi', 500);
  return serverKey;
};

const resolveExplicitProductionFlag = () => {
  const explicit = normalizeValue(process.env.MIDTRANS_IS_PRODUCTION).toLowerCase();
  if (['true', '1', 'yes'].includes(explicit)) return true;
  if (['false', '0', 'no'].includes(explicit)) return false;
  return null;
};

const isProductionMode = () => {
  const explicit = resolveExplicitProductionFlag();
  getServerKey();

  if (explicit != null) return explicit;

  logger.warn('MIDTRANS_IS_PRODUCTION tidak diset; fallback ke NODE_ENV untuk menentukan environment Midtrans');
  return process.env.NODE_ENV === 'production';
};

const getEnvironment = () => (isProductionMode() ? 'production' : 'development');
const isSandboxMode = () => !isProductionMode();

const getBaseUrl = () =>
  (isProductionMode()
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com');

const parseJsonSafe = (raw) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
};

const parseProviderDate = (value, fallbackMs, context) => {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    logger.warn('Midtrans returned invalid date, using fallback', { context, value });
  }

  return new Date(Date.now() + fallbackMs);
};

const normalizeIdrAmount = (value, context) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new AppError(`${context} tidak valid`, 422);
  }

  const rounded = Math.round(numeric);
  if (Math.abs(numeric - rounded) > Number.EPSILON) {
    logger.warn('Normalizing decimal IDR amount for Midtrans', {
      context,
      originalAmount: numeric,
      roundedAmount: rounded,
    });
  }

  return rounded;
};

const resolveNotificationUrl = () => {
  const explicitUrl = normalizeValue(
    process.env.MIDTRANS_NOTIFICATION_URL
    || process.env.PAYMENT_CALLBACK_URL
    || process.env.BACKEND_PUBLIC_URL
  );

  if (explicitUrl) {
    try {
      const parsed = new URL(explicitUrl);
      if (parsed.pathname === '/' || parsed.pathname === '') {
        return new URL('/api/payments/webhook/midtrans', parsed.origin).toString();
      }
      return parsed.toString();
    } catch {
      throw new AppError('MIDTRANS_NOTIFICATION_URL tidak valid', 500);
    }
  }

  throw new AppError('MIDTRANS_NOTIFICATION_URL belum dikonfigurasi', 500);
};

const shouldRetry = ({ status, error }) => {
  if (error) return true;
  if ([408, 409, 425, 429].includes(status)) return true;
  if (status >= 500) return true;
  return false;
};

const buildAuthHeader = () => {
  const credentials = Buffer.from(`${getServerKey()}:`).toString('base64');
  return `Basic ${credentials}`;
};

const midtransRequest = async (method, path, body = null, options = {}) => {
  const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : DEFAULT_RETRY_COUNT;
  const retryDelayMs = Number(options.retryDelayMs || DEFAULT_RETRY_DELAY_MS);

  const headers = {
    Accept: 'application/json',
    Authorization: buildAuthHeader(),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.idempotencyKey ? { 'X-Idempotency-Key': options.idempotencyKey } : {}),
    ...(options.overrideNotificationUrl
      ? { 'X-Override-Notification': options.overrideNotificationUrl }
      : {}),
    ...(options.extraHeaders || {}),
  };

  const requestBody = body ? JSON.stringify(body) : undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(`${getBaseUrl()}${path}`, {
        method,
        headers,
        ...(requestBody ? { body: requestBody } : {}),
      });

      const raw = await response.text();
      const data = parseJsonSafe(raw);

      if (response.ok) return data;

      if (attempt < maxRetries && shouldRetry({ status: response.status })) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      logger.error('Midtrans API error', { status: response.status, path, data });
      throw new AppError(
        data.status_message || data.message || `Midtrans error: ${response.status}`,
        response.status >= 500 ? 502 : 422,
        data.status_code || null,
      );
    } catch (error) {
      if (error instanceof AppError) throw error;

      if (attempt < maxRetries && shouldRetry({ error })) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      logger.error('Midtrans network error', { path, message: error.message });
      throw new AppError(`Midtrans request gagal: ${error.message}`, 502);
    }
  }

  throw new AppError('Midtrans request gagal setelah retry', 502);
};

const formatMidtransTimestamp = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
  const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}:${second} ${sign}${offsetHours}${offsetRemainder}`;
};

const parseWebhookDate = (...values) => {
  for (const value of values) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const mapTransactionStatus = (transactionStatus, fraudStatus) => {
  const status = String(transactionStatus || '').toLowerCase();
  const fraud = String(fraudStatus || '').toLowerCase();

  if (['capture', 'settlement'].includes(status)) {
    return fraud && fraud !== 'accept' ? 'FAILED' : 'SUCCESS';
  }

  if (['pending', 'authorize'].includes(status)) return 'PENDING';
  if (status === 'expire') return 'EXPIRED';
  if (['cancel', 'deny', 'failure'].includes(status)) return 'FAILED';
  if (['refund', 'partial_refund'].includes(status)) return 'REFUNDED';

  return 'PENDING';
};

const normalizeRefundRows = (refunds) => {
  if (Array.isArray(refunds)) return refunds;
  if (Array.isArray(refunds?.refunds)) return refunds.refunds;
  return [];
};

const extractActionUrl = (actions, actionName) => {
  if (!Array.isArray(actions)) return null;

  const matched = actions.find(
    (row) => String(row?.name || '').trim().toLowerCase() === actionName.toLowerCase(),
  );

  const url = matched?.url;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
};

const extractRefundKey = (row) =>
  String(
    row?.refund_key
    || row?.refundKey
    || row?.refund_chargeback_id
    || row?.refundChargebackId
    || row?.refund_chargeback_uuid
    || row?.refundChargebackUuid
    || ''
  ).trim();

const parseTransactionPayload = (payload = {}) => ({
  type: String(payload.payment_type || payload.paymentType || '').toLowerCase() === 'qris'
    ? 'QRIS'
    : 'PAYMENT',
  gatewayRef: payload.order_id || payload.orderId || null,
  externalId: payload.order_id || payload.orderId || null,
  transactionId: payload.transaction_id || payload.transactionId || null,
  status: mapTransactionStatus(
    payload.transaction_status || payload.transactionStatus,
    payload.fraud_status || payload.fraudStatus,
  ),
  rawStatus: payload.transaction_status || payload.transactionStatus || null,
  amount: payload.gross_amount ?? payload.grossAmount ?? payload.amount ?? null,
  paidAt: parseWebhookDate(
    payload.settlement_time,
    payload.settlementTime,
    payload.transaction_time,
    payload.transactionTime,
  ),
  expiredAt: parseWebhookDate(payload.expiry_time, payload.expiryTime),
  qrImageUrl: extractActionUrl(payload.actions, 'generate-qr-code'),
  refunds: normalizeRefundRows(payload.refunds),
});

const createQris = async ({
  externalId,
  amount,
  description = 'Payment',
  idempotencyKey,
}) => {
  const qrisAmount = normalizeIdrAmount(amount, 'amount QRIS');

  const expiryMinutes = Number.isFinite(DEFAULT_QRIS_EXPIRY_MINUTES) && DEFAULT_QRIS_EXPIRY_MINUTES > 0
    ? DEFAULT_QRIS_EXPIRY_MINUTES
    : 15;
  const now = new Date();

  const data = await midtransRequest(
    'POST',
    '/v2/charge',
    {
      payment_type: 'qris',
      transaction_details: {
        order_id: externalId,
        gross_amount: qrisAmount,
      },
      qris: {
        acquirer: DEFAULT_QRIS_ACQUIRER,
      },
      custom_expiry: {
        order_time: formatMidtransTimestamp(now),
        expiry_duration: expiryMinutes,
        unit: 'minute',
      },
      custom_field1: description.slice(0, 255),
    },
    {
      idempotencyKey: idempotencyKey || externalId,
      overrideNotificationUrl: resolveNotificationUrl(),
    },
  );

  const parsed = parseTransactionPayload(data);
  if (!data.qr_string) {
    throw new AppError('Midtrans tidak mengembalikan qr_string untuk QRIS', 502);
  }

  if (['FAILED', 'EXPIRED'].includes(parsed.status)) {
    throw new AppError(data.status_message || 'Gagal membuat transaksi QRIS Midtrans', 422);
  }

  return {
    gatewayRef: data.order_id || externalId,
    externalId: data.order_id || externalId,
    transactionId: data.transaction_id || null,
    amount: qrisAmount,
    qrString: data.qr_string,
    qrImageUrl: extractActionUrl(data.actions, 'generate-qr-code'),
    acquirer: data.acquirer || DEFAULT_QRIS_ACQUIRER,
    expiresAt: parsed.expiredAt || parseProviderDate(null, expiryMinutes * 60 * 1000, 'qris.expiredAt'),
    status: parsed.status,
  };
};

const getTransactionStatus = async (orderId) =>
  midtransRequest('GET', `/v2/${encodeURIComponent(orderId)}/status`);

const mapRefundStatus = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (['refund', 'partial_refund', 'success', 'succeeded'].includes(normalized)) return 'SUCCESS';
  if (['cancel', 'deny', 'expire', 'failure', 'failed'].includes(normalized)) return 'FAILED';
  if (['pending', 'processing'].includes(normalized)) return 'PROCESSING';
  return 'PROCESSING';
};

const createRefund = async ({
  orderId,
  refundKey,
  amount,
  reason,
  idempotencyKey,
}) => {
  const refundAmount = normalizeIdrAmount(amount, 'amount refund');

  const data = await midtransRequest(
    'POST',
    `/v2/${encodeURIComponent(orderId)}/refund/online/direct`,
    {
      refund_key: refundKey,
      amount: refundAmount,
      reason: reason || 'Requested by merchant',
    },
    {
      idempotencyKey: idempotencyKey || refundKey,
    },
  );

  return {
    refundId: data.refund_chargeback_id || data.refund_chargeback_uuid || data.refund_key || refundKey,
    refundKey: data.refund_key || refundKey,
    amount: Number(data.refund_amount || data.amount || refundAmount),
    status: mapRefundStatus(data.transaction_status || data.status || data.refund_status),
    raw: data,
  };
};

const extractRefundStatus = (transactionData, refundKey) => {
  const parsed = parseTransactionPayload(transactionData);
  const matchedRefund = parsed.refunds.find((row) => extractRefundKey(row) === refundKey);

  if (matchedRefund) return 'SUCCESS';

  if (parsed.status === 'REFUNDED') return 'SUCCESS';
  if (parsed.status === 'FAILED') return 'FAILED';

  return 'PROCESSING';
};

const safeCompare = (left, right) => {
  const a = Buffer.from(String(left || '').toLowerCase(), 'utf8');
  const b = Buffer.from(String(right || '').toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const verifyWebhookSignature = (payload) => {
  const signature = payload?.signature_key || payload?.signatureKey;
  if (!signature) {
    if (process.env.ALLOW_INSECURE_MIDTRANS_WEBHOOK === 'true') return;
    throw new AppError('signature_key webhook Midtrans tidak ditemukan', 401);
  }

  const orderId = String(payload?.order_id || payload?.orderId || '');
  const statusCode = String(payload?.status_code || payload?.statusCode || '');
  const grossAmount = String(payload?.gross_amount || payload?.grossAmount || '');
  const expected = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${getServerKey()}`)
    .digest('hex');

  if (!safeCompare(signature, expected)) {
    throw new AppError('Invalid webhook signature', 401);
  }
};

const parseWebhookEvent = (payload) => {
  const parsed = parseTransactionPayload(payload);
  if (!parsed.gatewayRef && !parsed.transactionId) {
    logger.warn('Midtrans webhook: unknown payload structure', { keys: Object.keys(payload || {}) });
    return null;
  }

  return parsed;
};

module.exports = {
  createQris,
  createRefund,
  extractRefundStatus,
  getEnvironment,
  getTransactionStatus,
  isSandboxMode,
  mapRefundStatus,
  mapTransactionStatus,
  parseTransactionPayload,
  parseWebhookEvent,
  verifyWebhookSignature,
};
