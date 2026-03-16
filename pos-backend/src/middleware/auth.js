// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { AppError } = require('../utils/errors');

// Role hierarchy
const ROLE_LEVELS = {
  SUPER_ADMIN: 3,
  MANAGER: 2,
  CASHIER: 1,
  WAITER: 1,
  KITCHEN: 1,
};

/**
 * Verify JWT token dan attach user ke req
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        branchId: true,
      },
    });

    if (!user || !user.isActive) {
      throw new AppError('User not found or inactive', 401);
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token expired', 401));
    }
    next(err);
  }
};

/**
 * Middleware untuk cek role minimum
 * Contoh: authorize('MANAGER') → hanya MANAGER ke atas yang boleh
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }

    const userLevel = ROLE_LEVELS[req.user.role] || 0;
    const minLevel = Math.min(...roles.map((r) => ROLE_LEVELS[r] || 0));

    if (userLevel < minLevel) {
      return next(new AppError('Forbidden: insufficient role', 403));
    }

    next();
  };
};

/**
 * Pastikan user hanya bisa akses data cabangnya sendiri
 * (kecuali SUPER_ADMIN)
 */
const requireBranchAccess = (branchIdParam = 'branch_id') => {
  return (req, res, next) => {
    const { role, branchId } = req.user;

    if (role === 'SUPER_ADMIN') {
      return next();
    }

    const requestedBranchId =
      req.params?.[branchIdParam]
      ?? req.query?.[branchIdParam]
      ?? req.body?.[branchIdParam]
      ?? req.params?.branch_id
      ?? req.query?.branch_id
      ?? req.body?.branch_id
      ?? req.params?.branchId
      ?? req.query?.branchId
      ?? req.body?.branchId;

    const normalizedRequestedBranchId = requestedBranchId
      ? String(requestedBranchId)
      : null;

    if (normalizedRequestedBranchId && normalizedRequestedBranchId !== branchId) {
      return next(new AppError('Forbidden: no access to this branch', 403));
    }

    req.branchId = branchId;
    next();
  };
};

module.exports = { authenticate, authorize, requireBranchAccess };
