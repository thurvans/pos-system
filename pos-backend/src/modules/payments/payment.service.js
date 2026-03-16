/**
 * Payment Service
 * Metode aktif: CASH, QRIS, CARD
 */

const prisma = require('../../config/prisma');
const { AppError } = require('../../utils/errors');
const logger = require('../../config/logger');
const midtrans = require('./providers/midtrans.provider');
const { applyIngredientUsageForOrder } = require('../../utils/ingredientUsage');

const PAYMENT_METHODS = new Set(['CASH', 'QRIS', 'CARD']);

const buildExternalId = (prefix, idempotencyKey) =>
  `POS::${prefix}-${idempotencyKey}`;

const toValidDateOrNull = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseWebhookPayload = (rawBody) => {
  if (!rawBody) return {};
  if (Buffer.isBuffer(rawBody)) {
    return JSON.parse(rawBody.toString('utf8'));
  }
  if (typeof rawBody === 'string') {
    return JSON.parse(rawBody);
  }
  if (typeof rawBody === 'object') {
    return rawBody;
  }
  throw new Error('Unsupported webhook payload');
};

const assertRequesterCanProcessOrder = (order, requester) => {
  if (!requester) return;

  if (requester.role === 'CASHIER' && order.cashierId !== requester.id) {
    throw new AppError('Kasir hanya bisa memproses pembayaran order miliknya sendiri', 403);
  }

  if (
    ['CASHIER', 'MANAGER'].includes(requester.role)
    && requester.branchId
    && requester.branchId !== order.branchId
  ) {
    throw new AppError('Forbidden: no access to this branch order', 403);
  }
};

const markOrderAsPaid = async ({ tx, orderId, actorUserId = null }) => {
  const currentOrder = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });

  if (!currentOrder) {
    throw new AppError('Order tidak ditemukan', 404);
  }

  if (['CANCELLED', 'VOID'].includes(currentOrder.status)) {
    return;
  }

  if (currentOrder.status !== 'PAID') {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'PAID' },
    });
  }

  await applyIngredientUsageForOrder({
    orderId,
    actorUserId,
    db: tx,
  });
};

const createPaymentIntentService = async ({
  orderId,
  method,
  idempotencyKey,
  requester,
}) => {
  if (!/^[A-Za-z0-9:_-]{8,80}$/.test(idempotencyKey || '')) {
    throw new AppError('idempotencyKey tidak valid', 422);
  }

  if (!PAYMENT_METHODS.has(method)) {
    throw new AppError(`Metode ${method} tidak didukung`, 422);
  }

  const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.orderId !== orderId) {
      throw new AppError('idempotencyKey sudah dipakai untuk order lain', 409);
    }
    logger.info(`Idempotent payment: ${idempotencyKey}`);
    return existing;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { branch: { select: { id: true, name: true } } },
  });

  if (!order) throw new AppError('Order tidak ditemukan', 404);
  if (['PAID', 'FULFILLED'].includes(order.status)) {
    throw new AppError('Order sudah lunas', 422);
  }
  if (['CANCELLED', 'VOID'].includes(order.status)) {
    throw new AppError(`Order berstatus ${order.status}`, 422);
  }

  assertRequesterCanProcessOrder(order, requester);

  switch (method) {
    case 'CASH':
      return processCash(order, idempotencyKey, requester);
    case 'CARD':
      return processCard(order, idempotencyKey, requester);
    case 'QRIS':
      return processQris(order, idempotencyKey);
    default:
      throw new AppError(`Metode ${method} tidak didukung`, 422);
  }
};

const processCash = async (order, idempotencyKey, requester) => prisma.$transaction(async (tx) => {
  const payment = await tx.payment.create({
    data: {
      orderId: order.id,
      method: 'CASH',
      status: 'SUCCESS',
      amount: order.totalAmount,
      idempotencyKey,
      paidAt: new Date(),
    },
  });

  await markOrderAsPaid({
    tx,
    orderId: order.id,
    actorUserId: requester?.id || null,
  });
  return payment;
});

const processCard = async (order, idempotencyKey, requester) => prisma.$transaction(async (tx) => {
  const payment = await tx.payment.create({
    data: {
      orderId: order.id,
      method: 'CARD',
      status: 'SUCCESS',
      amount: order.totalAmount,
      idempotencyKey,
      paidAt: new Date(),
      meta: {
        channel: 'DEBIT',
        provider: 'OFFLINE_EDC',
      },
    },
  });

  await markOrderAsPaid({
    tx,
    orderId: order.id,
    actorUserId: requester?.id || null,
  });
  return payment;
});

const processQris = async (order, idempotencyKey) => {
  const externalId = buildExternalId('POS-QRIS', idempotencyKey);
  const environment = midtrans.getEnvironment();

  const qrisData = await midtrans.createQris({
    externalId,
    amount: Number(order.totalAmount),
    description: `Order ${order.receiptNumber}`,
    idempotencyKey: externalId,
  });

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        orderId: order.id,
        method: 'QRIS',
        status: 'PENDING',
        amount: qrisData.amount,
        idempotencyKey,
        gatewayRef: qrisData.gatewayRef,
        qrPayload: qrisData.qrString,
        expiredAt: toValidDateOrNull(qrisData.expiresAt),
        meta: {
          provider: 'midtrans',
          externalId,
          transactionId: qrisData.transactionId,
          environment,
          testMode: midtrans.isSandboxMode(),
          canSimulate: false,
          acquirer: qrisData.acquirer || null,
          qrImageUrl: qrisData.qrImageUrl || null,
          requestedAmount: Number(order.totalAmount),
        },
      },
    });

    await tx.order.update({ where: { id: order.id }, data: { status: 'PENDING_PAYMENT' } });
    return p;
  });

  return {
    ...payment,
    qrString: qrisData.qrString,
    qrImageUrl: qrisData.qrImageUrl || null,
    expiresAt: toValidDateOrNull(qrisData.expiresAt),
  };
};

const buildPaymentEventKey = (event, payment) =>
  `${event.gatewayRef || payment.gatewayRef || payment.id}-${event.status}`;

const SUCCESS_CONFIRMATION_RETRY_DELAYS_MS = [0, 1000, 2500];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const confirmSuccessWithMidtrans = async (payment, event) => {
  if (payment.method !== 'QRIS' || !payment.gatewayRef) {
    return event;
  }

  for (let attempt = 0; attempt < SUCCESS_CONFIRMATION_RETRY_DELAYS_MS.length; attempt += 1) {
    const delayMs = SUCCESS_CONFIRMATION_RETRY_DELAYS_MS[attempt];
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const remoteData = await midtrans.getTransactionStatus(payment.gatewayRef);
      const remoteEvent = midtrans.parseTransactionPayload(remoteData);

      if (remoteEvent?.status === 'SUCCESS') {
        if (
          event.transactionId
          && remoteEvent.transactionId
          && event.transactionId !== remoteEvent.transactionId
        ) {
          logger.warn('Midtrans webhook success ignored because transaction_id does not match remote status', {
            gatewayRef: payment.gatewayRef,
            webhookTransactionId: event.transactionId,
            remoteTransactionId: remoteEvent.transactionId,
          });
          return null;
        }

        return {
          ...event,
          paidAt: remoteEvent.paidAt || event.paidAt,
          transactionId: remoteEvent.transactionId || event.transactionId,
        };
      }

      if (remoteEvent?.status && !['PENDING', 'AUTHORIZE'].includes(remoteEvent.status)) {
        logger.warn(`Midtrans webhook success ignored because remote status is ${remoteEvent.status}`, {
          gatewayRef: payment.gatewayRef,
          transactionId: event.transactionId || null,
        });
        return null;
      }

      if (attempt === SUCCESS_CONFIRMATION_RETRY_DELAYS_MS.length - 1) {
        logger.warn(`Midtrans webhook success ignored because remote status is ${remoteEvent?.status || 'UNKNOWN'}`, {
          gatewayRef: payment.gatewayRef,
          transactionId: event.transactionId || null,
        });
      }
    } catch (err) {
      if (attempt === SUCCESS_CONFIRMATION_RETRY_DELAYS_MS.length - 1) {
        logger.warn(`Midtrans webhook success verification failed for ref=${payment.gatewayRef}: ${err.message}`);
      }
    }
  }

  return null;
};

const handleWebhookService = async ({ rawBody }) => {
  let payload;
  try {
    payload = parseWebhookPayload(rawBody);
  } catch {
    throw new AppError('Webhook payload tidak valid (bukan JSON)', 400);
  }

  midtrans.verifyWebhookSignature(payload);

  const event = midtrans.parseWebhookEvent(payload);
  if (!event) return { received: true };

  logger.info(`Midtrans webhook: type=${event.type} status=${event.status} ref=${event.gatewayRef}`);

  const payment = await prisma.payment.findFirst({
    where: { gatewayRef: event.gatewayRef },
  });
  if (!payment) {
    logger.warn(`Midtrans webhook: payment tidak ditemukan untuk ref=${event.gatewayRef}`);
    return { received: true };
  }

  const eventKey = buildPaymentEventKey(event, payment);
  const duplicate = await prisma.paymentEvent.findFirst({
    where: { paymentId: payment.id, eventType: eventKey },
  });
  if (duplicate) {
    logger.info(`Midtrans webhook: event duplikat ${eventKey}`);
    return { received: true };
  }

  await prisma.paymentEvent.create({
    data: { paymentId: payment.id, eventType: eventKey, provider: 'midtrans', rawPayload: payload },
  });

  if (event.status === 'SUCCESS') {
    const confirmedEvent = await confirmSuccessWithMidtrans(payment, event);
    if (confirmedEvent) await handlePaymentSuccess(payment, confirmedEvent);
  }
  else if (event.status === 'FAILED') await handlePaymentFailed(payment);
  else if (event.status === 'EXPIRED') await handlePaymentExpired(payment);

  return { received: true };
};

const mergePaymentMeta = (payment, event) => ({
  ...(payment.meta && typeof payment.meta === 'object' ? payment.meta : {}),
  ...(event.transactionId ? { transactionId: event.transactionId } : {}),
});

const handlePaymentSuccess = async (payment, event) => {
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        paidAt: event.paidAt || new Date(),
        meta: mergePaymentMeta(payment, event),
      },
    });

    await tx.payment.updateMany({
      where: {
        orderId: payment.orderId,
        id: { not: payment.id },
        status: { in: ['INITIATED', 'PENDING'] },
      },
      data: {
        status: 'EXPIRED',
        expiredAt: new Date(),
      },
    });

    await markOrderAsPaid({
      tx,
      orderId: payment.orderId,
      actorUserId: null,
    });
  });

  logger.info(`Payment SUCCESS: id=${payment.id} order=${payment.orderId}`);
};

const handlePaymentFailed = async (payment) => {
  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
};

const handlePaymentExpired = async (payment) => {
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'EXPIRED' } });
    await tx.order.update({ where: { id: payment.orderId }, data: { status: 'CANCELLED' } });
  });
};

const checkPaymentStatus = async (paymentId) => {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new AppError('Payment tidak ditemukan', 404);

  if (['SUCCESS', 'EXPIRED', 'REFUNDED'].includes(payment.status)) {
    return payment;
  }

  if (payment.status === 'FAILED' && ['CASH', 'CARD'].includes(payment.method)) {
    return payment;
  }

  if (['CASH', 'CARD'].includes(payment.method)) return payment;

  if (payment.createdAt && Date.now() - payment.createdAt.getTime() < 5000) {
    return payment;
  }

  try {
    let remoteEvent = null;

    if (payment.method === 'QRIS' && payment.gatewayRef) {
      const remoteData = await midtrans.getTransactionStatus(payment.gatewayRef);
      remoteEvent = midtrans.parseTransactionPayload(remoteData);
    }

    const currentMeta = payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
    if (
      remoteEvent?.qrImageUrl
      && currentMeta.qrImageUrl !== remoteEvent.qrImageUrl
    ) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          meta: {
            ...currentMeta,
            qrImageUrl: remoteEvent.qrImageUrl,
          },
        },
      });

      payment.meta = {
        ...currentMeta,
        qrImageUrl: remoteEvent.qrImageUrl,
      };
    }

    const remoteStatus = remoteEvent?.status;

    if (remoteStatus === 'SUCCESS' && payment.status !== 'SUCCESS') {
      await handlePaymentSuccess(payment, { paidAt: remoteEvent.paidAt || new Date(), transactionId: remoteEvent.transactionId });
      return prisma.payment.findUnique({ where: { id: paymentId } });
    }

    if (remoteStatus === 'FAILED' && payment.status !== 'FAILED') {
      await handlePaymentFailed(payment);
      return prisma.payment.findUnique({ where: { id: paymentId } });
    }

    if (remoteStatus === 'EXPIRED' && payment.status !== 'EXPIRED') {
      await handlePaymentExpired(payment);
      return prisma.payment.findUnique({ where: { id: paymentId } });
    }
  } catch (err) {
    logger.error(`Polling error payment ${paymentId}: ${err.message}`);
  }

  return payment;
};

const simulatePaymentService = async () => {
  throw new AppError('Simulasi payment tidak tersedia untuk Midtrans QRIS', 422);
};

module.exports = {
  createPaymentIntentService,
  handleWebhookService,
  checkPaymentStatus,
  simulatePaymentService,
};
