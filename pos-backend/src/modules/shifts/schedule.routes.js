const express = require('express');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const { authenticate, authorize } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');
const { AppError } = require('../../utils/errors');

const router = express.Router();

router.use(
  authenticate,
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('EMPLOYEE_SHIFT_MANAGE'),
);

const parseId = z.string().uuid('ID tidak valid');

const resolveBranchId = (req, branchId) => {
  if (req.user.role === 'SUPER_ADMIN') return branchId || null;
  if (!req.user.branchId) throw new AppError('Manager harus terikat cabang', 422);
  if (branchId && branchId !== req.user.branchId) {
    throw new AppError('Forbidden: hanya bisa akses cabang sendiri', 403);
  }
  return req.user.branchId;
};

router.get('/', async (req, res, next) => {
  try {
    const { branch_id, user_id, date_from, date_to, status } = req.query;
    const branchId = resolveBranchId(req, branch_id);

    const schedules = await prisma.shiftSchedule.findMany({
      where: {
        ...(branchId && { branchId }),
        ...(user_id && { userId: user_id }),
        ...(status && { status }),
        ...((date_from || date_to) && {
          startAt: {
            ...(date_from && { gte: new Date(`${date_from}T00:00:00.000Z`) }),
            ...(date_to && { lte: new Date(`${date_to}T23:59:59.999Z`) }),
          },
        }),
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        branch: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    res.json(schedules.map((row) => ({
      id: row.id,
      start_at: row.startAt?.toISOString(),
      end_at: row.endAt?.toISOString(),
      status: row.status,
      note: row.note,
      created_at: row.createdAt?.toISOString(),
      user_id: row.userId,
      branch_id: row.branchId,
      created_by: row.createdBy,
      user: row.user,
      branch: row.branch,
      creator: row.creator,
    })));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = z.object({
      userId: parseId,
      branchId: parseId.optional(),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      status: z.enum(['PLANNED', 'CONFIRMED', 'CANCELLED']).optional(),
      note: z.string().optional(),
    }).parse(req.body);

    const branchId = resolveBranchId(req, body.branchId);
    if (!branchId) throw new AppError('branchId wajib', 422);
    if (new Date(body.endAt) <= new Date(body.startAt)) {
      throw new AppError('endAt harus lebih besar dari startAt', 422);
    }

    const schedule = await prisma.shiftSchedule.create({
      data: {
        userId: body.userId,
        branchId,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
        status: body.status || 'PLANNED',
        note: body.note || null,
        createdBy: req.user.id,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(schedule);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = z.object({
      userId: parseId.optional(),
      branchId: parseId.optional(),
      startAt: z.string().datetime().optional(),
      endAt: z.string().datetime().optional(),
      status: z.enum(['PLANNED', 'CONFIRMED', 'CANCELLED']).optional(),
      note: z.string().nullable().optional(),
    }).parse(req.body);

    const existing = await prisma.shiftSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Schedule tidak ditemukan', 404);

    const branchId = resolveBranchId(req, body.branchId || existing.branchId);
    const nextStartAt = body.startAt ? new Date(body.startAt) : existing.startAt;
    const nextEndAt = body.endAt ? new Date(body.endAt) : existing.endAt;
    if (nextEndAt <= nextStartAt) {
      throw new AppError('endAt harus lebih besar dari startAt', 422);
    }

    const schedule = await prisma.shiftSchedule.update({
      where: { id: req.params.id },
      data: {
        ...(body.userId !== undefined && { userId: body.userId }),
        ...(body.branchId !== undefined && { branchId }),
        ...(body.startAt !== undefined && { startAt: nextStartAt }),
        ...(body.endAt !== undefined && { endAt: nextEndAt }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.note !== undefined && { note: body.note }),
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    res.json(schedule);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.shiftSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Schedule tidak ditemukan', 404);
    resolveBranchId(req, existing.branchId);

    const row = await prisma.shiftSchedule.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });
    res.json({
      ...row,
      message: 'Schedule dibatalkan',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
