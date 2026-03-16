const prisma = require('../config/prisma');
const { AppError } = require('../utils/errors');

const CACHE_TTL_MS = 60 * 1000;
const permissionCache = new Map();

const getCachedPermissions = async (role) => {
  const now = Date.now();
  const cached = permissionCache.get(role);
  if (cached && (now - cached.at) < CACHE_TTL_MS) {
    return cached.permissions;
  }

  const rows = await prisma.rolePermission.findMany({
    where: { role },
    select: { permission: true },
  });
  const permissions = new Set(rows.map((row) => row.permission));
  permissionCache.set(role, { at: now, permissions });
  return permissions;
};

const requirePermissions = (...required) => async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }
    if (!required.length || req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const permissions = await getCachedPermissions(req.user.role);
    const allowed = required.some((permission) => permissions.has(permission));
    if (!allowed) {
      return next(new AppError('Forbidden: insufficient permission', 403));
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

const clearPermissionCache = () => {
  permissionCache.clear();
};

module.exports = {
  requirePermissions,
  clearPermissionCache,
};

