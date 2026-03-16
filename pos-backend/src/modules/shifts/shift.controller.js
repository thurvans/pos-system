const { z } = require('zod');
const { serializeShift } = require('../../utils/serializers');
const {
  openShiftService,
  closeShiftService,
  cashInOutService,
  getActiveShiftService,
  getShiftSummaryService,
} = require('./shift.service');
const prisma = require('../../config/prisma');
const { buildBusinessDateRange } = require('../../utils/businessDate');

// Helper: ID bisa UUID atau format lain (misal branch-main-001)
const idSchema = z.string().min(1);

const openShift = async (req, res, next) => {
  try {
    const body = z.object({
      branchId:    idSchema,
      openingCash: z.number().min(0),
    }).parse(req.body);

    const shift = await openShiftService({
      userId:      req.user.id,
      branchId:    body.branchId,
      openingCash: body.openingCash,
    });

    res.status(201).json(serializeShift(shift));
  } catch (err) {
    next(err);
  }
};

const closeShift = async (req, res, next) => {
  try {
    const body = z.object({
      closingCash: z.number().min(0),
    }).parse(req.body);

    const result = await closeShiftService({
      shiftId:     req.params.id,
      userId:      req.user.id,
      closingCash: body.closingCash,
    });

    res.json({
      shift:   serializeShift(result.shift || result),
      summary: result.summary || null,
    });
  } catch (err) {
    next(err);
  }
};

const getActiveShift = async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || req.user.branchId;
    if (!branchId) {
      return res.status(400).json({ error: 'branch_id diperlukan' });
    }
    const shift = await getActiveShiftService({ userId: req.user.id, branchId });
    res.json(shift ? serializeShift(shift) : null);
  } catch (err) {
    next(err);
  }
};

const getShiftSummary = async (req, res, next) => {
  try {
    const result = await getShiftSummaryService(req.params.id);
    res.json({
      shift:   serializeShift(result.shift),
      summary: result.summary,
    });
  } catch (err) {
    next(err);
  }
};

const listShifts = async (req, res, next) => {
  try {
    const { branch_id, date_from, date_to, page = 1, limit = 20 } = req.query;
    const openedAt = buildBusinessDateRange({ dateFrom: date_from, dateTo: date_to });

    const where = {
      ...(branch_id && { branchId: branch_id }),
      ...(openedAt && { openedAt }),
    };

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        skip:     (Number(page) - 1) * Number(limit),
        take:     Number(limit),
        orderBy:  { openedAt: 'desc' },
        include: {
          user:   { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          _count: { select: { orders: true } },
        },
      }),
      prisma.shift.count({ where }),
    ]);

    res.json({
      data: shifts.map(serializeShift),
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    next(err);
  }
};

const cashInOut = async (req, res, next) => {
  try {
    const body = z.object({
      type:   z.enum(['CASH_IN', 'CASH_OUT']),
      amount: z.number().positive(),
      note:   z.string().min(1, 'Keterangan wajib diisi'),
    }).parse(req.body);

    const movement = await cashInOutService({
      shiftId: req.params.id,
      userId:  req.user.id,
      ...body,
    });

    res.status(201).json(movement);
  } catch (err) {
    next(err);
  }
};

module.exports = { openShift, closeShift, getActiveShift, getShiftSummary, listShifts, cashInOut };
