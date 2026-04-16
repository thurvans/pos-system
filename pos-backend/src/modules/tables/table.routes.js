const express = require('express');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const { authenticate, authorize, requireBranchAccess } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');
const { AppError } = require('../../utils/errors');

const router = express.Router();

const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'OUT_OF_SERVICE'];
const ACTIVE_ORDER_STATUSES = ['DRAFT', 'PENDING_PAYMENT'];

const createTableSchema = z.object({
  branchId: z.string().uuid('branchId tidak valid').optional(),
  name: z.string().trim().min(1, 'Nama meja wajib').max(30, 'Nama meja maksimal 30 karakter'),
  status: z.enum(TABLE_STATUSES).optional(),
  isActive: z.boolean().optional(),
});

const updateTableSchema = z.object({
  name: z.string().trim().min(1, 'Nama meja wajib').max(30, 'Nama meja maksimal 30 karakter').optional(),
  status: z.enum(TABLE_STATUSES).optional(),
  isActive: z.boolean().optional(),
});

const statusSchema = z.object({
  status: z.enum(TABLE_STATUSES),
});

const activeSchema = z.object({
  isActive: z.boolean(),
});

const bulkSchema = z.object({
  branchId: z.string().uuid('branchId tidak valid').optional(),
  names: z.array(z.string().trim().min(1)).optional(),
  raw: z.string().optional(),
});

const normalizeTableName = (value = '') => String(value).trim();
const normalizeKey = (value = '') => normalizeTableName(value).toUpperCase();
const splitRawNames = (raw = '') =>
  String(raw)
    .split(/\r?\n|,/g)
    .map((value) => normalizeTableName(value))
    .filter(Boolean);

const getEffectiveTableStatus = (status, occupiedByActiveOrder = false) => {
  const normalizedStatus = String(status || 'AVAILABLE').toUpperCase();

  if (normalizedStatus === 'OUT_OF_SERVICE') return 'OUT_OF_SERVICE';
  if (occupiedByActiveOrder || normalizedStatus === 'OCCUPIED') return 'OCCUPIED';
  if (normalizedStatus === 'RESERVED') return 'RESERVED';
  return 'AVAILABLE';
};

const serializeTable = (row, extras = {}) => ({
  id: row.id,
  branch_id: row.branchId,
  branchId: row.branchId,
  name: row.name,
  status: row.status,
  is_active: row.isActive,
  isActive: row.isActive,
  created_at: row.createdAt?.toISOString?.() || row.createdAt,
  updated_at: row.updatedAt?.toISOString?.() || row.updatedAt,
  order_count: row._count?.orders || 0,
  ...extras,
});

const serializeTableWithOccupancy = (row, occupiedByActiveOrder = false) => {
  const effectiveStatus = getEffectiveTableStatus(row.status, occupiedByActiveOrder);

  return serializeTable(row, {
    base_status: row.status,
    baseStatus: row.status,
    status: effectiveStatus,
    occupied_by_active_order: occupiedByActiveOrder,
    occupiedByActiveOrder,
    occupied: effectiveStatus === 'OCCUPIED',
  });
};

const resolveBranchId = (req, branchId) => {
  const requestedBranchId = branchId || null;

  if (req.user.role === 'SUPER_ADMIN') {
    return requestedBranchId;
  }

  if (!req.user.branchId) {
    throw new AppError('User harus terikat cabang', 422);
  }

  if (requestedBranchId && requestedBranchId !== req.user.branchId) {
    throw new AppError('Forbidden: hanya bisa akses cabang sendiri', 403);
  }

  return req.user.branchId;
};

const getActiveOrderTableSet = async (branchId) => {
  if (!branchId) return new Set();

  const activeOrders = await prisma.order.findMany({
    where: {
      branchId,
      orderType: 'DINE_IN',
      status: { in: ACTIVE_ORDER_STATUSES },
      NOT: { tableNumber: null },
    },
    select: { tableNumber: true },
  });

  const set = new Set();
  for (const order of activeOrders) {
    const key = normalizeKey(order.tableNumber);
    if (key) set.add(key);
  }
  return set;
};

const buildOccupancy = async (branchId) => {
  const [tables, activeOrderTableSet] = await Promise.all([
    prisma.diningTable.findMany({
      where: { branchId, isActive: true },
      orderBy: { name: 'asc' },
    }),
    getActiveOrderTableSet(branchId),
  ]);

  const rows = tables.map((table) => {
    const key = normalizeKey(table.name);
    const occupiedByActiveOrder = activeOrderTableSet.has(key);
    return serializeTableWithOccupancy(table, occupiedByActiveOrder);
  });

  const totalTables = rows.length;
  const outOfServiceTables = rows.filter((row) => row.status === 'OUT_OF_SERVICE').length;
  const reservedTables = rows.filter((row) => row.status === 'RESERVED').length;
  const operationalTables = rows.filter((row) => row.status !== 'OUT_OF_SERVICE').length;
  const occupiedTables = rows.filter(
    (row) => row.status !== 'OUT_OF_SERVICE' && row.occupied
  ).length;
  const availableTables = rows.filter(
    (row) => row.status === 'AVAILABLE' && !row.occupiedByActiveOrder
  ).length;

  const occupancyRate = operationalTables
    ? Number(((occupiedTables / operationalTables) * 100).toFixed(2))
    : 0;

  return {
    totalTables,
    operationalTables,
    occupiedTables,
    reservedTables,
    outOfServiceTables,
    availableTables,
    occupancyRate,
    rows,
  };
};

router.use(authenticate, requireBranchAccess());

// Runtime endpoint for cashier app.
router.get('/runtime', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, req.query.branch_id || req.branchId);
    if (!branchId) throw new AppError('branch_id wajib', 422);

    const includeOccupied = String(req.query.include_occupied || 'false') === 'true';
    const tables = await prisma.diningTable.findMany({
      where: {
        branchId,
        isActive: true,
        status: { not: 'OUT_OF_SERVICE' },
      },
      orderBy: { name: 'asc' },
    });

    const activeOrderTableSet = await getActiveOrderTableSet(branchId);
    const mapped = tables.map((table) => {
      const occupiedByActiveOrder = activeOrderTableSet.has(normalizeKey(table.name));
      const effectiveStatus = getEffectiveTableStatus(table.status, occupiedByActiveOrder);
      return {
        id: table.id,
        name: table.name,
        status: effectiveStatus,
        base_status: table.status,
        baseStatus: table.status,
        occupied: effectiveStatus === 'OCCUPIED',
        occupied_by_active_order: occupiedByActiveOrder,
      };
    });

    const data = includeOccupied
      ? mapped
      : mapped.filter((row) => !row.occupied && row.status !== 'RESERVED');

    res.json({
      branchId,
      includeOccupied,
      data,
      total: data.length,
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/occupancy',
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('DASHBOARD_OCCUPANCY'),
  async (req, res, next) => {
    try {
      const branchId = resolveBranchId(req, req.query.branch_id || req.branchId);
      if (!branchId) throw new AppError('branch_id wajib', 422);

      const summary = await buildOccupancy(branchId);
      res.json({
        branchId,
        ...summary,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.use(
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('TABLE_MANAGE')
);

router.get('/', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, req.query.branch_id || req.branchId);
    if (!branchId) throw new AppError('branch_id wajib', 422);

    const includeInactive = String(req.query.include_inactive || 'false') === 'true';
    const q = String(req.query.q || '').trim();
    const status = req.query.status && TABLE_STATUSES.includes(req.query.status)
      ? req.query.status
      : null;

    const requestedStatus = status;
    const where = {
      branchId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(q && { name: { contains: q, mode: 'insensitive' } }),
    };

    const [rows, activeOrderTableSet] = await Promise.all([
      prisma.diningTable.findMany({
        where,
        include: { _count: { select: { orders: true } } },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      getActiveOrderTableSet(branchId),
    ]);

    const data = rows
      .map((row) => serializeTableWithOccupancy(
        row,
        activeOrderTableSet.has(normalizeKey(row.name)),
      ))
      .filter((row) => (requestedStatus ? row.status === requestedStatus : true));

    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await prisma.diningTable.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { orders: true } } },
    });
    if (!row) throw new AppError('Meja tidak ditemukan', 404);

    resolveBranchId(req, row.branchId);
    const occupiedByActiveOrder = (await getActiveOrderTableSet(row.branchId))
      .has(normalizeKey(row.name));

    res.json(serializeTableWithOccupancy(row, occupiedByActiveOrder));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = createTableSchema.parse(req.body);
    const branchId = resolveBranchId(req, body.branchId || req.branchId);
    if (!branchId) throw new AppError('branchId wajib', 422);

    const created = await prisma.diningTable.create({
      data: {
        branchId,
        name: normalizeTableName(body.name),
        status: body.status || 'AVAILABLE',
        isActive: body.isActive ?? true,
      },
      include: { _count: { select: { orders: true } } },
    });

    res.status(201).json(serializeTable(created));
  } catch (err) {
    if (err.code === 'P2002') {
      return next(new AppError('Nama meja sudah dipakai di cabang ini', 422));
    }
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = updateTableSchema.parse(req.body);
    if (!Object.keys(body).length) {
      throw new AppError('Tidak ada data yang diubah', 422);
    }

    const existing = await prisma.diningTable.findUnique({
      where: { id: req.params.id },
      select: { id: true, branchId: true },
    });
    if (!existing) throw new AppError('Meja tidak ditemukan', 404);
    resolveBranchId(req, existing.branchId);

    const updated = await prisma.diningTable.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined && { name: normalizeTableName(body.name) }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      include: { _count: { select: { orders: true } } },
    });

    res.json(serializeTable(updated));
  } catch (err) {
    if (err.code === 'P2002') {
      return next(new AppError('Nama meja sudah dipakai di cabang ini', 422));
    }
    next(err);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const existing = await prisma.diningTable.findUnique({
      where: { id: req.params.id },
      select: { id: true, branchId: true },
    });
    if (!existing) throw new AppError('Meja tidak ditemukan', 404);
    resolveBranchId(req, existing.branchId);

    const updated = await prisma.diningTable.update({
      where: { id: req.params.id },
      data: { status },
      include: { _count: { select: { orders: true } } },
    });

    res.json(serializeTable(updated));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/active', async (req, res, next) => {
  try {
    const { isActive } = activeSchema.parse(req.body);
    const existing = await prisma.diningTable.findUnique({
      where: { id: req.params.id },
      select: { id: true, branchId: true },
    });
    if (!existing) throw new AppError('Meja tidak ditemukan', 404);
    resolveBranchId(req, existing.branchId);

    const updated = await prisma.diningTable.update({
      where: { id: req.params.id },
      data: {
        isActive,
        ...(isActive ? {} : { status: 'OUT_OF_SERVICE' }),
      },
      include: { _count: { select: { orders: true } } },
    });

    res.json(serializeTable(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.diningTable.findUnique({
      where: { id: req.params.id },
      select: { id: true, branchId: true },
    });
    if (!existing) throw new AppError('Meja tidak ditemukan', 404);
    resolveBranchId(req, existing.branchId);

    const updated = await prisma.diningTable.update({
      where: { id: req.params.id },
      data: {
        isActive: false,
        status: 'OUT_OF_SERVICE',
      },
      include: { _count: { select: { orders: true } } },
    });

    res.json({
      ...serializeTable(updated),
      message: 'Meja dinonaktifkan',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', async (req, res, next) => {
  try {
    const body = bulkSchema.parse(req.body);
    const branchId = resolveBranchId(req, body.branchId || req.branchId);
    if (!branchId) throw new AppError('branchId wajib', 422);

    const fromRaw = body.raw ? splitRawNames(body.raw) : [];
    const fromNames = (body.names || []).map((name) => normalizeTableName(name));
    const requested = [...fromRaw, ...fromNames].filter(Boolean);

    const uniqueMap = new Map();
    for (const name of requested) {
      const key = normalizeKey(name);
      if (!key) continue;
      uniqueMap.set(key, name);
    }

    const uniqueNames = [...uniqueMap.values()].slice(0, 200);
    if (!uniqueNames.length) {
      throw new AppError('Nama meja wajib diisi', 422);
    }

    const payload = uniqueNames.map((name) => ({
      branchId,
      name,
      status: 'AVAILABLE',
      isActive: true,
    }));

    const created = await prisma.diningTable.createMany({
      data: payload,
      skipDuplicates: true,
    });

    res.status(201).json({
      branchId,
      requestedCount: requested.length,
      uniqueCount: uniqueNames.length,
      createdCount: created.count,
      names: uniqueNames,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
