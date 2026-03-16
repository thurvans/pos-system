const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/prisma');
const { AppError } = require('../../utils/errors');
const { clearPermissionCache } = require('../../middleware/featurePermission');

const USER_MANAGER_ROLES = new Set(['SUPER_ADMIN', 'MANAGER']);
const MANAGER_ALLOWED_ROLES = new Set(['CASHIER', 'WAITER', 'KITCHEN']);
const ALL_PERMISSIONS = [
  'DASHBOARD_OVERVIEW',
  'DASHBOARD_REVENUE_TREND',
  'DASHBOARD_TOP_PRODUCTS',
  'DASHBOARD_OCCUPANCY',
  'DASHBOARD_ACTIVE_ORDERS',
  'MENU_CATEGORY_MANAGE',
  'MENU_ITEM_MANAGE',
  'MENU_VARIANT_MANAGE',
  'MENU_MODIFIER_MANAGE',
  'MENU_BUNDLE_MANAGE',
  'ORDER_MONITOR',
  'ORDER_HISTORY_VIEW',
  'ORDER_CANCEL',
  'FINANCE_REPORT_VIEW',
  'FINANCE_EXPORT_PDF',
  'SHIFT_RECAP_VIEW',
  'EMPLOYEE_MANAGE',
  'EMPLOYEE_SHIFT_MANAGE',
  'AUDIT_LOG_VIEW',
  'PROMO_MANAGE',
  'SYSTEM_SETTINGS_MANAGE',
  'SYSTEM_BACKUP_MANAGE',
];

const normalizePermissions = (permissions = []) => (
  [...new Set(permissions.filter((permission) => ALL_PERMISSIONS.includes(permission)))].sort()
);

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
  return { accessToken, refreshToken };
};

const getPermissionsByRole = async (role) => {
  if (role === 'SUPER_ADMIN') {
    return ALL_PERMISSIONS;
  }

  const permissions = await prisma.rolePermission.findMany({
    where: { role },
    select: { permission: true },
    orderBy: { permission: 'asc' },
  });

  return normalizePermissions(permissions.map((item) => item.permission));
};

const listRolePermissionsService = async () => {
  const rows = await prisma.rolePermission.findMany({
    orderBy: [{ role: 'asc' }, { permission: 'asc' }],
  });

  const grouped = {
    SUPER_ADMIN: ALL_PERMISSIONS,
    MANAGER: [],
    CASHIER: [],
    WAITER: [],
    KITCHEN: [],
  };

  for (const row of rows) {
    if (!grouped[row.role]) grouped[row.role] = [];
    grouped[row.role].push(row.permission);
  }

  for (const key of Object.keys(grouped)) {
    grouped[key] = normalizePermissions(grouped[key]);
  }

  return grouped;
};

const setRolePermissionsService = async ({ role, permissions }) => {
  if (role === 'SUPER_ADMIN') {
    throw new AppError('Permission SUPER_ADMIN tidak bisa diubah', 422);
  }

  const normalizedPermissions = [...new Set(permissions || [])]
    .filter((permission) => ALL_PERMISSIONS.includes(permission));

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { role } });
    if (normalizedPermissions.length) {
      await tx.rolePermission.createMany({
        data: normalizedPermissions.map((permission) => ({ role, permission })),
        skipDuplicates: true,
      });
    }
  });

  clearPermissionCache();

  return {
    role,
    permissions: normalizedPermissions.sort(),
  };
};

const loginService = async ({ email, password }) => {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { branch: { select: { id: true, name: true } } },
  });

  if (!user || !user.isActive) {
    throw new AppError('Email atau password salah', 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Email atau password salah', 401);
  }

  const permissions = await getPermissionsByRole(user.role);
  const tokens = generateTokens(user.id);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      permissions,
    },
    ...tokens,
  };
};

const refreshService = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') throw new Error('not a refresh token');

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive) throw new AppError('User tidak ditemukan', 401);

    return generateTokens(user.id);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Refresh token tidak valid atau sudah kadaluarsa', 401);
  }
};

const getRequesterRole = (requester) => requester?.role || 'CASHIER';

const ensureCanManageUsers = (requester) => {
  const requesterRole = getRequesterRole(requester);
  if (!USER_MANAGER_ROLES.has(requesterRole)) {
    throw new AppError('Forbidden: hanya manager ke atas yang dapat mengelola user', 403);
  }
  return requesterRole;
};

const ensureManagerCanAssignRole = (requesterRole, targetRole) => {
  if (requesterRole === 'MANAGER' && !MANAGER_ALLOWED_ROLES.has(targetRole)) {
    throw new AppError('Manager hanya bisa menambahkan role cashier, waiter, atau kitchen', 403);
  }
};

const ensureManagerCanUpdateTarget = (requesterRole, existingUser, nextRole, nextIsActive) => {
  if (requesterRole !== 'MANAGER') return;

  if (existingUser.role === 'SUPER_ADMIN' && nextIsActive === false) {
    throw new AppError('Manager tidak bisa menghapus atau menonaktifkan Super Admin', 403);
  }

  if (!MANAGER_ALLOWED_ROLES.has(existingUser.role)) {
    throw new AppError('Manager hanya bisa mengelola akun cashier, waiter, atau kitchen', 403);
  }

  if (nextRole !== undefined && !MANAGER_ALLOWED_ROLES.has(nextRole)) {
    throw new AppError('Manager tidak bisa menetapkan role selain cashier, waiter, atau kitchen', 403);
  }
};

const ensureManagerCanAccessTargetBranch = (requesterRole, requesterBranchId, targetBranchId) => {
  if (requesterRole !== 'MANAGER') return;

  if (!requesterBranchId) {
    throw new AppError('Manager harus terikat ke cabang untuk mengelola user', 422);
  }

  if (!targetBranchId || targetBranchId !== requesterBranchId) {
    throw new AppError('Manager hanya bisa mengelola user di cabangnya sendiri', 403);
  }
};

const listUsersService = async ({ role, branchId, page = 1, limit = 20, requester }) => {
  const requesterRole = ensureCanManageUsers(requester);
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (parsedPage - 1) * parsedLimit;
  const where = {
    ...(role && { role }),
    ...(branchId && { branchId }),
  };

  if (requesterRole === 'MANAGER') {
    if (role && !MANAGER_ALLOWED_ROLES.has(role)) {
      throw new AppError('Manager hanya bisa melihat data cashier, waiter, atau kitchen', 403);
    }

    if (role) {
      where.role = role;
    } else {
      where.role = { in: [...MANAGER_ALLOWED_ROLES] };
    }

    if (requester?.branchId) {
      where.branchId = requester.branchId;
    }
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: parsedLimit,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branchId: true,
        isActive: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users,
    meta: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

const createUserService = async ({ name, email, password, role, branchId, requester }) => {
  const requesterRole = ensureCanManageUsers(requester);
  ensureManagerCanAssignRole(requesterRole, role);

  if (requesterRole === 'MANAGER') {
    if (!requester?.branchId) {
      throw new AppError('Manager harus terikat ke cabang untuk membuat user', 422);
    }
    if (branchId && branchId !== requester.branchId) {
      throw new AppError('Manager hanya bisa membuat user di cabangnya sendiri', 403);
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new AppError('Email sudah digunakan', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      role,
      branchId: requesterRole === 'MANAGER' ? requester.branchId : (branchId || null),
    },
    select: { id: true, name: true, email: true, role: true, branchId: true, createdAt: true },
  });
};

const updateUserService = async (id, { name, email, role, branchId, isActive, password }, requester) => {
  const requesterRole = ensureCanManageUsers(requester);
  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      email: true,
      branchId: true,
    },
  });
  if (!existingUser) {
    throw new AppError('User tidak ditemukan', 404);
  }

  ensureManagerCanUpdateTarget(requesterRole, existingUser, role, isActive);
  ensureManagerCanAccessTargetBranch(requesterRole, requester?.branchId, existingUser.branchId);

  if (requesterRole === 'MANAGER' && branchId !== undefined) {
    if (!requester?.branchId) {
      throw new AppError('Manager harus terikat ke cabang untuk mengubah user', 422);
    }
    if (branchId === null) {
      throw new AppError('Manager tidak bisa melepas cabang user', 403);
    }
    if (branchId !== null && branchId !== requester.branchId) {
      throw new AppError('Manager tidak bisa memindahkan user ke cabang lain', 403);
    }
  }

  let normalizedEmail;
  if (email !== undefined) {
    normalizedEmail = email.trim().toLowerCase();
    const existingEmailOwner = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingEmailOwner && existingEmailOwner.id !== id) {
      throw new AppError('Email sudah digunakan', 409);
    }
  }

  const data = {
    ...(name !== undefined && { name }),
    ...(email !== undefined && { email: normalizedEmail }),
    ...(role !== undefined && { role }),
    ...(branchId !== undefined && { branchId }),
    ...(isActive !== undefined && { isActive }),
    ...(password && { passwordHash: await bcrypt.hash(password, 12) }),
  };

  if (Object.keys(data).length === 0) {
    throw new AppError('Tidak ada field yang diupdate', 422);
  }

  return prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, branchId: true, isActive: true },
  });
};

const USER_DELETE_BLOCKERS = {
  shifts: 'shift',
  orders: 'order',
  cancelledOrders: 'order yang dibatalkan',
  auditLogs: 'audit log',
  orderStatusHistories: 'riwayat status order',
  orderCancellations: 'log pembatalan order',
  shiftSchedules: 'jadwal shift',
  createdShiftSchedules: 'jadwal shift yang dibuat',
  ingredientMovements: 'pergerakan bahan',
  purchaseOrdersCreated: 'purchase order',
  stockOpnamesPerformed: 'stok opname',
  stockOpnamesApproved: 'approval stok opname',
};

const deleteUserService = async (id, requester) => {
  const requesterRole = ensureCanManageUsers(requester);
  if (requesterRole !== 'SUPER_ADMIN') {
    throw new AppError('Hanya owner yang dapat menghapus user', 403);
  }

  if (requester?.id === id) {
    throw new AppError('Owner tidak bisa menghapus akun sendiri', 422);
  }

  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      _count: {
        select: {
          shifts: true,
          orders: true,
          cancelledOrders: true,
          auditLogs: true,
          orderStatusHistories: true,
          orderCancellations: true,
          shiftSchedules: true,
          createdShiftSchedules: true,
          ingredientMovements: true,
          purchaseOrdersCreated: true,
          stockOpnamesPerformed: true,
          stockOpnamesApproved: true,
        },
      },
    },
  });

  if (!existingUser) {
    throw new AppError('User tidak ditemukan', 404);
  }

  if (existingUser.role === 'SUPER_ADMIN') {
    const remainingOwners = await prisma.user.count({
      where: {
        role: 'SUPER_ADMIN',
        isActive: true,
        id: { not: id },
      },
    });

    if (remainingOwners === 0) {
      throw new AppError('Minimal harus ada satu owner aktif tersisa', 422);
    }
  }

  const blockingRelations = Object.entries(existingUser._count)
    .filter(([, count]) => count > 0)
    .map(([key]) => USER_DELETE_BLOCKERS[key] || 'data terkait');

  if (blockingRelations.length > 0) {
    const summary = [...new Set(blockingRelations)].slice(0, 3).join(', ');
    throw new AppError(`User tidak bisa dihapus karena masih terhubung ke ${summary}`, 409);
  }

  await prisma.user.delete({ where: { id } });
  return { success: true };
};

module.exports = {
  loginService,
  refreshService,
  listUsersService,
  createUserService,
  updateUserService,
  deleteUserService,
  getPermissionsByRole,
  listRolePermissionsService,
  setRolePermissionsService,
};
