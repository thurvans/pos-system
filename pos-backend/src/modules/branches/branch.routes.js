const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { authenticate, authorize } = require('../../middleware/auth');
const prisma = require('../../config/prisma');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const where = req.user.role === 'SUPER_ADMIN'
      ? { isActive: true }
      : { isActive: true, id: req.user.branchId || '__NO_BRANCH__' };
    const branches = await prisma.branch.findMany({ where });
    res.json(branches);
  } catch (err) {
    next(err);
  }
});

const branchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
});

router.post('/', authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const body = branchSchema.parse(req.body);
    const branch = await prisma.branch.create({ data: body });
    res.status(201).json(branch);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const body = branchSchema.partial().parse(req.body);
    const branch = await prisma.branch.update({ where: { id: req.params.id }, data: body });
    res.json(branch);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
