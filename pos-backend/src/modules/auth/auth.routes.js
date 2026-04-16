const express = require('express');
const { z } = require('zod');
const { login, refreshToken, me } = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');
const {
  listUsersService,
  createUserService,
  updateUserService,
  deleteUserService,
  listRolePermissionsService,
  setRolePermissionsService,
} = require('./auth.service');

const router = express.Router();
const idSchema = z.string().min(1);
const roleSchema = z.enum(['CASHIER', 'WAITER', 'KITCHEN', 'MANAGER', 'SUPER_ADMIN']);
const permissionSchema = z.enum([
  'DASHBOARD_OVERVIEW',
  'DASHBOARD_REVENUE_TREND',
  'DASHBOARD_TOP_PRODUCTS',
  'DASHBOARD_OCCUPANCY',
  'DASHBOARD_ACTIVE_ORDERS',
  'TABLE_MANAGE',
  'MENU_CATEGORY_MANAGE',
  'MENU_ITEM_MANAGE',
  'MENU_VARIANT_MANAGE',
  'MENU_MODIFIER_MANAGE',
  'MENU_BUNDLE_MANAGE',
  'ORDER_MONITOR',
  'ORDER_HISTORY_VIEW',
  'ORDER_CANCEL',
  'INVENTORY_MASTER_MANAGE',
  'INVENTORY_PURCHASE_MANAGE',
  'INVENTORY_STOCK_OPNAME',
  'INVENTORY_REPORT_VIEW',
  'FINANCE_REPORT_VIEW',
  'FINANCE_EXPORT_PDF',
  'SHIFT_RECAP_VIEW',
  'EMPLOYEE_MANAGE',
  'EMPLOYEE_SHIFT_MANAGE',
  'AUDIT_LOG_VIEW',
  'PROMO_MANAGE',
  'SYSTEM_SETTINGS_MANAGE',
  'SYSTEM_BACKUP_MANAGE',
]);

router.post('/login', login);
router.post('/refresh', refreshToken);
router.get('/me', authenticate, me);

router.get(
  '/users',
  authenticate,
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('EMPLOYEE_MANAGE'),
  async (req, res, next) => {
    try {
      const result = await listUsersService({
        role: req.query.role,
        branchId: req.query.branch_id,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        requester: req.user,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/users',
  authenticate,
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('EMPLOYEE_MANAGE'),
  async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        role: roleSchema,
        branchId: idSchema.optional(),
      }).parse(req.body);

      const user = await createUserService({ ...body, requester: req.user });
      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/users/:id',
  authenticate,
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('EMPLOYEE_MANAGE'),
  async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        role: roleSchema.optional(),
        branchId: idSchema.nullable().optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(6).optional(),
      }).parse(req.body);

      const user = await updateUserService(req.params.id, body, req.user);
      res.json(user);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/users/:id',
  authenticate,
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('EMPLOYEE_MANAGE'),
  async (req, res, next) => {
    try {
      const result = await deleteUserService(req.params.id, req.user);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/permissions/roles',
  authenticate,
  authorize('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const result = await listRolePermissionsService();
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/permissions/roles/:role',
  authenticate,
  authorize('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const body = z.object({
        permissions: z.array(permissionSchema),
      }).parse(req.body);
      const role = roleSchema.parse(req.params.role);
      const result = await setRolePermissionsService({ role, permissions: body.permissions });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
