const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');
const {
  listUsersService,
  createUserService,
  updateUserService,
  deleteUserService,
} = require('../auth/auth.service');

const router = express.Router();
const idSchema = z.string().min(1);
const roleSchema = z.enum(['CASHIER', 'WAITER', 'KITCHEN', 'MANAGER', 'SUPER_ADMIN']);

router.use(
  authenticate,
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('EMPLOYEE_MANAGE'),
);

router.get('/', async (req, res, next) => {
  try {
    const result = await listUsersService({
      role: req.query.role,
      branchId: req.query.branch_id,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 100,
      requester: req.user,
    });
    res.json(result.data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: roleSchema.default('CASHIER'),
      branchId: idSchema.optional(),
    }).parse(req.body);

    const user = await createUserService({ ...body, requester: req.user });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1).optional(),
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
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteUserService(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
