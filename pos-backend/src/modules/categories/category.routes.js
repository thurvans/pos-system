const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../../middleware/auth');
const prisma = require('../../config/prisma');

const router = express.Router();

router.use(authenticate);

const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nama kategori wajib diisi'),
});

const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Nama kategori wajib diisi').optional(),
  isActive: z.boolean().optional(),
});

const serializeCategory = (category) => ({
  id: category.id,
  name: category.name,
  is_active: category.isActive,
  isActive: category.isActive,
  productCount: category._count?.products || 0,
  created_at: category.createdAt?.toISOString(),
  updated_at: category.updatedAt?.toISOString(),
});

// GET /categories?include_inactive=true
router.get('/', async (req, res, next) => {
  try {
    const includeInactive = String(req.query.include_inactive || 'false') === 'true';

    const categories = await prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    res.json(categories.map(serializeCategory));
  } catch (err) {
    next(err);
  }
});

// POST /categories
router.post('/', authorize('MANAGER', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { name } = categoryCreateSchema.parse(req.body);
    const category = await prisma.category.create({
      data: { name, isActive: true },
      include: { _count: { select: { products: true } } },
    });
    res.status(201).json(serializeCategory(category));
  } catch (err) {
    next(err);
  }
});

// PUT /categories/:id
router.put('/:id', authorize('MANAGER', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const body = categoryUpdateSchema.parse(req.body);
    if (Object.keys(body).length === 0) {
      return res.status(422).json({ error: 'Tidak ada data yang diubah' });
    }

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: body,
      include: { _count: { select: { products: true } } },
    });

    res.json(serializeCategory(category));
  } catch (err) {
    next(err);
  }
});

// DELETE /categories/:id (soft delete)
router.delete('/:id', authorize('MANAGER', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { isActive: false },
      include: { _count: { select: { products: true } } },
    });
    res.json({
      ...serializeCategory(category),
      message: 'Kategori dinonaktifkan',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
