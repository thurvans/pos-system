/**
 * Refund Service
 *
 * Rules:
 * - Hanya MANAGER ke atas yang bisa approve refund
 * - Refund hanya bisa dilakukan pada order Lunas
 * - Partial refund diperbolehkan (amount <= original payment)
 * - CASH/CARD: refund manual (catat saja, tidak perlu gateway)
 * - QRIS: refund via Midtrans Direct Refund API
 * - Idempotent: satu payment hanya bisa di-refund sekali (kecuali partial)
 */

const prisma = require('../../config/prisma');
const { AppError } = require('../../utils/errors');
const logger = require('../../config/logger');
const midtrans = require('./providers/midtrans.provider');
const { restoreIngredientUsageForOrder } = require('../../utils/ingredientUsage');

const buildRefundReferenceId = (refundId) => `REFUND-${refundId}`;

const requestRefundService = async ({ paymentId, amount, reason, requestedBy }) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: {
        include: {
          items: true,
          branch: true,
        },
      },
      refunds: true,
    },
  });

  if (!payment) throw new AppError('Payment tidak ditemukan', 404);
  if (payment.status !== 'SUCCESS') throw new AppError('Hanya payment SUCCESS yang bisa di-refund', 422);

  const order = payment.order;
  if (!['PAID', 'FULFILLED'].includes(order.status)) {
    throw new AppError(`Order berstatus ${order.status}, tidak bisa di-refund`, 422);
  }

  const alreadyRefunded = payment.refunds
    .filter((row) => ['PENDING', 'PROCESSING', 'SUCCESS'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.amount), 0);

  const maxRefundable = Number(payment.amount) - alreadyRefunded;

  if (amount > maxRefundable) {
    throw new AppError(
      `Jumlah refund (${amount}) melebihi sisa yang bisa di-refund (${maxRefundable})`,
      422,
    );
  }

  const refund = await prisma.$transaction(async (tx) => {
    const createdRefund = await tx.refund.create({
      data: {
        paymentId,
        orderId: order.id,
        amount,
        reason: reason || 'Permintaan pelanggan',
        status: 'PENDING',
        requestedBy,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'REFUND_REQUEST',
        entity: 'refunds',
        entityId: createdRefund.id,
        userId: requestedBy,
        newData: { paymentId, amount, reason },
      },
    });

    return createdRefund;
  });

  try {
    if (['CASH', 'CARD'].includes(payment.method)) {
      return await processOfflineRefund(refund.id, requestedBy);
    }

    return await processGatewayRefund(refund.id, payment, amount, reason);
  } catch (err) {
    await prisma.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED', failReason: err.message },
    });
    throw new AppError(`Refund gagal: ${err.message}`, 502);
  }
};

const processOfflineRefund = async (refundId, requestedBy) => {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { payment: true, order: { include: { items: true } } },
  });

  return prisma.$transaction(async (tx) => {
    const updatedRefund = await tx.refund.update({
      where: { id: refundId },
      data: { status: 'SUCCESS', processedAt: new Date() },
    });

    await tx.payment.update({
      where: { id: refund.paymentId },
      data: { status: 'REFUNDED' },
    });

    await tx.order.update({
      where: { id: refund.orderId },
      data: { status: 'VOID' },
    });

    await restoreIngredientUsageForOrder({
      orderId: refund.orderId,
      actorUserId: requestedBy,
      db: tx,
    });

    await tx.auditLog.create({
      data: {
        action: 'REFUND_SUCCESS',
        entity: 'refunds',
        entityId: refundId,
        userId: requestedBy,
        newData: { method: refund.payment.method, amount: refund.amount },
      },
    });

    logger.info(`Offline refund SUCCESS: refundId=${refundId}`);
    return updatedRefund;
  });
};

const resolveGatewayOrderId = (payment) => String(
  payment.gatewayRef
  || payment.meta?.externalId
  || '',
).trim();

const processGatewayRefund = async (refundId, payment, amount, reason) => {
  await prisma.refund.update({ where: { id: refundId }, data: { status: 'PROCESSING' } });

  const orderId = resolveGatewayOrderId(payment);
  if (!orderId) {
    throw new AppError('Referensi transaksi Midtrans tidak tersedia', 422);
  }

  const refundKey = buildRefundReferenceId(refundId);
  const midtransRefund = await midtrans.createRefund({
    orderId,
    refundKey,
    amount,
    reason,
    idempotencyKey: refundKey,
  });

  const refund = await prisma.refund.update({
    where: { id: refundId },
    data: {
      gatewayRef: midtransRefund.refundKey,
      status: midtransRefund.status === 'SUCCESS' ? 'SUCCESS' : 'PROCESSING',
      processedAt: midtransRefund.status === 'SUCCESS' ? new Date() : null,
    },
  });

  if (midtransRefund.status === 'SUCCESS') {
    await finalizeRefund(refundId, payment.orderId, payment.id);
  }

  logger.info(`Gateway refund initiated: refundId=${refundId} status=${refund.status}`);
  return refund;
};

const finalizeRefund = async (refundId, orderId, paymentId) => {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { order: { include: { items: true } } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refundId },
      data: { status: 'SUCCESS', processedAt: new Date() },
    });

    await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
    await tx.order.update({ where: { id: orderId }, data: { status: 'VOID' } });
    await restoreIngredientUsageForOrder({
      orderId,
      actorUserId: refund?.requestedBy || null,
      db: tx,
    });
  });

  logger.info(`Refund finalized: refundId=${refundId}`);
};

const getRefundsByOrder = async (orderId) => prisma.refund.findMany({
  where: { orderId },
  orderBy: { createdAt: 'desc' },
  include: {
    payment: { select: { method: true, amount: true } },
  },
});

const getRefund = async (refundId) => {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: {
      payment: { select: { method: true, amount: true, status: true } },
      order: { select: { receiptNumber: true, totalAmount: true } },
    },
  });
  if (!refund) throw new AppError('Refund tidak ditemukan', 404);
  return refund;
};

const checkRefundStatus = async (refundId) => {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: {
      payment: {
        select: {
          id: true,
          gatewayRef: true,
          meta: true,
        },
      },
    },
  });
  if (!refund) throw new AppError('Refund tidak ditemukan', 404);

  if (['SUCCESS', 'FAILED'].includes(refund.status)) return refund;
  if (!refund.gatewayRef) return refund;

  try {
    const orderId = resolveGatewayOrderId(refund.payment);
    if (!orderId) return refund;

    const data = await midtrans.getTransactionStatus(orderId);
    const status = midtrans.extractRefundStatus(data, refund.gatewayRef);

    if (status !== refund.status) {
      if (status === 'SUCCESS') {
        await finalizeRefund(refundId, refund.orderId, refund.paymentId);
      } else {
        await prisma.refund.update({ where: { id: refundId }, data: { status } });
      }
      return prisma.refund.findUnique({ where: { id: refundId } });
    }
  } catch (err) {
    logger.error(`Check refund status error: ${err.message}`);
  }

  return refund;
};

module.exports = {
  requestRefundService,
  getRefundsByOrder,
  getRefund,
  checkRefundStatus,
};
