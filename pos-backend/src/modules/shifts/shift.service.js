const prisma = require('../../config/prisma');
const { AppError } = require('../../utils/errors');
const logger = require('../../config/logger');
const REVENUE_ORDER_STATUSES = ['PAID'];
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// ─── Open Shift ───────────────────────────────────────────────

const openShiftService = async ({ userId, branchId, openingCash }) => {
  // Cek apakah user sudah punya shift aktif
  const existingShift = await prisma.shift.findFirst({
    where: { userId, branchId, status: 'OPEN' },
  });

  if (existingShift) {
    throw new AppError('Kamu sudah memiliki shift yang aktif. Tutup shift dulu sebelum membuka yang baru.', 422);
  }

  const shift = await prisma.$transaction(async (tx) => {
    const newShift = await tx.shift.create({
      data: {
        userId,
        branchId,
        openingCash,
        status: 'OPEN',
      },
      include: {
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    // Catat cash in awal sebagai CashMovement
    await tx.cashMovement.create({
      data: {
        shiftId: newShift.id,
        type: 'OPENING',
        amount: openingCash,
        note: 'Modal awal shift',
        recordedBy: userId,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'SHIFT_OPEN',
        entity: 'shifts',
        entityId: newShift.id,
        userId,
        newData: { openingCash, branchId },
      },
    });

    return newShift;
  });

  logger.info(`Shift opened: shiftId=${shift.id} user=${userId} branch=${branchId}`);
  return shift;
};

// ─── Close Shift ──────────────────────────────────────────────

const closeShiftService = async ({ shiftId, userId, closingCash }) => {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { cashMovements: true },
  });

  if (!shift) throw new AppError('Shift tidak ditemukan', 404);
  if (shift.status === 'CLOSED') throw new AppError('Shift sudah ditutup', 422);

  // Hanya kasir ybs atau manager ke atas yg boleh tutup
  if (shift.userId !== userId) {
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    const allowedRoles = ['MANAGER', 'SUPER_ADMIN'];
    if (!allowedRoles.includes(requestingUser.role)) {
      throw new AppError('Hanya pemilik shift atau manager yang bisa menutup shift ini', 403);
    }
  }

  // Hitung summary kas
  const summary = await buildShiftSummary(shiftId, shift);
  const normalizedClosingCash = roundMoney(closingCash);

  // Selisih kas
  const expectedCash = roundMoney(
    Number(shift.openingCash) +
    summary.cashIn -
    summary.cashOut +
    summary.cashSales
  );

  const cashDifference = roundMoney(normalizedClosingCash - expectedCash);

  const closedShift = await prisma.$transaction(async (tx) => {
    const updated = await tx.shift.update({
      where: { id: shiftId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closingCash: normalizedClosingCash,
      },
    });

    await tx.cashMovement.create({
      data: {
        shiftId,
        type: 'CLOSING',
        amount: normalizedClosingCash,
        note: `Penutupan shift. Selisih: ${cashDifference >= 0 ? '+' : ''}${cashDifference}`,
        recordedBy: userId,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'SHIFT_CLOSE',
        entity: 'shifts',
        entityId: shiftId,
        userId,
        newData: { closingCash: normalizedClosingCash, expectedCash, cashDifference },
      },
    });

    return updated;
  });

  logger.info(`Shift closed: shiftId=${shiftId} cashDiff=${cashDifference}`);

  return {
    shift: closedShift,
    summary: {
      ...summary,
      expectedCash,
      actualCash: normalizedClosingCash,
      cashDifference,
    },
  };
};

// ─── Cash In / Out ────────────────────────────────────────────

const cashInOutService = async ({ shiftId, userId, type, amount, note }) => {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) throw new AppError('Shift tidak ditemukan', 404);
  if (shift.status === 'CLOSED') throw new AppError('Shift sudah ditutup', 422);

  if (!['CASH_IN', 'CASH_OUT'].includes(type)) {
    throw new AppError('type harus CASH_IN atau CASH_OUT', 422);
  }

  const movement = await prisma.$transaction(async (tx) => {
    const mov = await tx.cashMovement.create({
      data: {
        shiftId,
        type,
        amount,
        note,
        recordedBy: userId,
      },
    });

    await tx.auditLog.create({
      data: {
        action: `SHIFT_${type}`,
        entity: 'shifts',
        entityId: shiftId,
        userId,
        newData: { amount, note },
      },
    });

    return mov;
  });

  return movement;
};

// ─── Get Active Shift ─────────────────────────────────────────

const getActiveShiftService = async ({ userId, branchId }) => {
  const shift = await prisma.shift.findFirst({
    where: { userId, branchId, status: 'OPEN' },
    include: {
      user: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      cashMovements: { orderBy: { createdAt: 'asc' } },
    },
  });

  return shift; // null jika tidak ada shift aktif
};

// ─── Shift Summary ────────────────────────────────────────────

const getShiftSummaryService = async (shiftId) => {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      user: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      cashMovements: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!shift) throw new AppError('Shift tidak ditemukan', 404);

  const summary = await buildShiftSummary(shiftId, shift);

  return { shift, summary };
};

// ─── Helper: Build Summary ────────────────────────────────────

const buildShiftSummary = async (shiftId, shift) => {
  // Semua order revenue di shift ini (paid + fulfilled).
  const orders = await prisma.order.findMany({
    where: { shiftId, status: { in: REVENUE_ORDER_STATUSES } },
    include: { payments: { where: { status: 'SUCCESS' } } },
  });

  // Breakdown per metode bayar
  const paymentBreakdown = {};
  let cashSales = 0;
  let totalSales = 0;

  for (const order of orders) {
    totalSales += Number(order.totalAmount);
    for (const payment of order.payments) {
      const method = payment.method;
      const amount = Number(payment.amount);
      paymentBreakdown[method] = (paymentBreakdown[method] || 0) + amount;
      if (method === 'CASH') cashSales += amount;
    }
  }

  // Cash movements (CASH_IN / CASH_OUT manual)
  const cashMovements = shift.cashMovements || [];
  const cashIn = cashMovements
    .filter((m) => m.type === 'CASH_IN')
    .reduce((sum, m) => sum + Number(m.amount), 0);
  const cashOut = cashMovements
    .filter((m) => m.type === 'CASH_OUT')
    .reduce((sum, m) => sum + Number(m.amount), 0);

  const roundedPaymentBreakdown = Object.fromEntries(
    Object.entries(paymentBreakdown).map(([method, amount]) => [method, roundMoney(amount)])
  );

  return {
    totalOrders: orders.length,
    totalSales: roundMoney(totalSales),
    paymentBreakdown: roundedPaymentBreakdown,
    cashSales: roundMoney(cashSales),
    cashIn: roundMoney(cashIn),
    cashOut: roundMoney(cashOut),
    cashMovements: cashMovements.filter((m) => ['CASH_IN', 'CASH_OUT'].includes(m.type)),
  };
};

module.exports = {
  openShiftService,
  closeShiftService,
  cashInOutService,
  getActiveShiftService,
  getShiftSummaryService,
};
