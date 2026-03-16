const express = require('express');
const prisma = require('../../config/prisma');
const { authenticate, authorize } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');

const router = express.Router();

router.use(
  authenticate,
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('AUDIT_LOG_VIEW'),
);

router.get('/', async (req, res, next) => {
  try {
    const { action, entity, user_id, date_from, date_to, page = 1, limit = 50 } = req.query;
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.min(200, Math.max(1, Number(limit) || 50));

    const where = {
      ...(action && { action: { contains: action, mode: 'insensitive' } }),
      ...(entity && { entity: { contains: entity, mode: 'insensitive' } }),
      ...(user_id && { userId: user_id }),
      ...((date_from || date_to) && {
        createdAt: {
          ...(date_from && { gte: new Date(`${date_from}T00:00:00.000Z`) }),
          ...(date_to && { lte: new Date(`${date_to}T23:59:59.999Z`) }),
        },
      }),
    };

    if (req.user.role === 'MANAGER' && req.user.branchId) {
      where.user = { branchId: req.user.branchId };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true, branchId: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      data: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entity_id: log.entityId,
        old_data: log.oldData,
        new_data: log.newData,
        ip: log.ip,
        created_at: log.createdAt?.toISOString(),
        user: log.user || null,
      })),
      meta: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
