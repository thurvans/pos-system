const express = require('express');
const router  = express.Router();
const path    = require('path');
const { z }   = require('zod');
const { authenticate, authorize }                         = require('../../middleware/auth');
const { upload, processAndSaveImage, deleteImageFile }    = require('../../middleware/upload');
const prisma  = require('../../config/prisma');
const { buildProductHppSummaryMap } = require('../../utils/hpp');
const { supportsProductVariants } = require('../../utils/productVariantPolicy');

const MANAGEMENT_ROLES = ['MANAGER', 'SUPER_ADMIN'];

router.use(authenticate);

const serializeHppSummary = (summary, { includeVariantSummaries = true } = {}) => {
  if (!summary) return null;

  const serializedVariantSummaries = Object.fromEntries(
    Object.entries(summary.variantSummaries || {}).map(([variantId, variantSummary]) => ([
      variantId,
      serializeHppSummary(variantSummary),
    ]))
  );

  return {
    branch_id: summary.branchId ?? null,
    branchId: summary.branchId ?? null,
    variant_id: summary.variantId ?? null,
    variantId: summary.variantId ?? null,
    estimated_cost: summary.estimatedCost,
    estimatedCost: summary.estimatedCost,
    recipe_configured: summary.recipeConfigured,
    recipeConfigured: summary.recipeConfigured,
    recipe_items_count: summary.recipeItemsCount,
    recipeItemsCount: summary.recipeItemsCount,
    missing_cost_count: summary.missingCostCount,
    missingCostCount: summary.missingCostCount,
    fully_costed: summary.fullyCosted,
    fullyCosted: summary.fullyCosted,
    variant_summaries: includeVariantSummaries ? serializedVariantSummaries : {},
    variantSummaries: includeVariantSummaries ? serializedVariantSummaries : {},
  };
};

const serializeVariant = (variant, hppSummary = null) => ({
  id: variant.id,
  product_id: variant.productId,
  productId: variant.productId,
  name: variant.name,
  sku: variant.sku ?? null,
  sort_order: variant.sortOrder ?? 0,
  sortOrder: variant.sortOrder ?? 0,
  is_default: variant.isDefault ?? false,
  isDefault: variant.isDefault ?? false,
  is_active: variant.isActive ?? true,
  isActive: variant.isActive ?? true,
  prices: (variant.prices ?? []).map((price) => ({
    id: price.id,
    variant_id: price.variantId,
    variantId: price.variantId,
    branch_id: price.branchId,
    branchId: price.branchId,
    price: Number(price.price),
    branch: price.branch ?? null,
  })),
  hpp_summary: serializeHppSummary(hppSummary),
  hppSummary: serializeHppSummary(hppSummary),
});

const serializeProduct = (p, hppSummary = null) => {
  const supportsVariants = supportsProductVariants(p);
  const serializedHppSummary = serializeHppSummary(hppSummary, {
    includeVariantSummaries: supportsVariants,
  });

  return {
    id:          p.id,
    sku:         p.sku,
    name:        p.name,
    description: p.description ?? null,
    image_url:   p.imageUrl    ?? null,
    is_active:   p.isActive,
    is_available: p.isAvailable,
    isAvailable: p.isAvailable,
    updated_at:  p.updatedAt?.toISOString(),
    category:    p.category    ?? null,
    supports_variants: supportsVariants,
    supportsVariants,
    prices: (p.prices ?? []).map((pr) => ({
      id:         pr.id,
      product_id: pr.productId,
      branch_id:  pr.branchId,
      price:      Number(pr.price),
    })),
    variants: supportsVariants
      ? (p.variants ?? []).map((variant) => (
        serializeVariant(variant, hppSummary?.variantSummaries?.[variant.id] || null)
      ))
      : [],
    hpp_summary: serializedHppSummary,
    hppSummary: serializedHppSummary,
  };
};

// ── GET /products ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const {
      updated_since,
      branch_id,
      q,
      category_id,
      is_active,
      is_available,
      page = 1,
      limit = 500,
    } = req.query;
    const effectiveBranchId = branch_id || req.user?.branchId || null;
    const where = {
      ...(q             && { name:       { contains: q, mode: 'insensitive' } }),
      ...(category_id   && { categoryId: category_id }),
      ...(updated_since && { updatedAt:  { gte: new Date(updated_since) } }),
      ...(is_active !== undefined && { isActive: String(is_active) === 'true' }),
      ...(is_available !== undefined && { isAvailable: String(is_available) === 'true' }),
    };
    const products = await prisma.product.findMany({
      where,
      skip:    (Number(page) - 1) * Number(limit),
      take:    Number(limit),
      include: {
        category: { select: { id: true, name: true } },
        prices:   effectiveBranchId ? { where: { branchId: effectiveBranchId } } : true,
        variants: {
          include: {
            prices: effectiveBranchId
              ? {
                where: { branchId: effectiveBranchId },
                include: { branch: { select: { id: true, name: true } } },
              }
              : {
                include: { branch: { select: { id: true, name: true } } },
              },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const hppSummaryMap = await buildProductHppSummaryMap({
      productIds: products.map((product) => product.id),
      branchId: effectiveBranchId,
      db: prisma,
    });
    res.json({
      data:     products.map((product) => serializeProduct(product, hppSummaryMap[product.id] || null)),
      meta:     { total: products.length, page: Number(page), limit: Number(limit) },
      syncedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// ── GET /products/:id ─────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const effectiveBranchId = req.query.branch_id || req.user?.branchId || null;
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        prices: effectiveBranchId ? { where: { branchId: effectiveBranchId } } : true,
        variants: {
          include: {
            prices: effectiveBranchId
              ? {
                where: { branchId: effectiveBranchId },
                include: { branch: { select: { id: true, name: true } } },
              }
              : {
                include: { branch: { select: { id: true, name: true } } },
              },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    const hppSummaryMap = await buildProductHppSummaryMap({
      productIds: [product.id],
      branchId: effectiveBranchId,
      db: prisma,
    });
    res.json(serializeProduct(product, hppSummaryMap[product.id] || null));
  } catch (err) { next(err); }
});

const productSchema = z.object({
  sku:         z.string().min(1),
  name:        z.string().min(1),
  description: z.string().optional(),
  categoryId:  z.string().optional(),
  imageUrl:    z.string().url().optional(),
  isActive:    z.boolean().optional(),
  isAvailable: z.boolean().optional(),
});

// ── POST /products ────────────────────────────────────────────
router.post('/', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const body    = productSchema.parse(req.body);
    const product = await prisma.product.create({
      data: body,
      include: {
        category: true,
        prices: true,
        variants: {
          include: { prices: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    res.status(201).json(serializeProduct(product));
  } catch (err) { next(err); }
});

// ── PUT /products/:id ─────────────────────────────────────────
router.put('/:id', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const body    = productSchema.partial().parse(req.body);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: body,
      include: {
        category: true,
        prices: true,
        variants: {
          include: { prices: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    res.json(serializeProduct(product));
  } catch (err) { next(err); }
});

// PATCH /products/:id/availability
router.patch('/:id/availability', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const { isAvailable } = z.object({
      isAvailable: z.boolean(),
    }).parse(req.body);

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { isAvailable },
      include: {
        category: true,
        prices: true,
        variants: {
          include: { prices: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });

    res.json({
      ...serializeProduct(product),
      message: isAvailable ? 'Produk tersedia' : 'Produk tidak tersedia',
    });
  } catch (err) { next(err); }
});

// ── POST /products/:id/image ──────────────────────────────────
router.post(
  '/:id/image',
  authorize(...MANAGEMENT_ROLES),
  upload.single('image'),           // field name: "image"
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'File gambar wajib diunggah' });

      // Cek produk ada
      const existing = await prisma.product.findUnique({
        where: { id: req.params.id }, select: { id: true, imageUrl: true },
      });
      if (!existing) return res.status(404).json({ error: 'Produk tidak ditemukan' });

      // Hapus file lama dari disk
      if (existing.imageUrl) deleteImageFile(existing.imageUrl);

      // Simpan file baru ke disk
      const filename = await processAndSaveImage(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      );

      // Bangun URL: /uploads/products/filename.jpg
      // Simpan sebagai path relatif — frontend tambahkan base URL sendiri
      const imageUrl = `/uploads/products/${filename}`;

      // Update database
      const product = await prisma.product.update({
        where:   { id: req.params.id },
        data:    { imageUrl },
        include: {
          category: true,
          prices: true,
          variants: {
            include: { prices: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
      });

      res.json({
        ...serializeProduct(product),
        message: 'Foto berhasil diupload',
      });
    } catch (err) { next(err); }
  },
);

// ── DELETE /products/:id/image ────────────────────────────────
router.delete('/:id/image', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const existing = await prisma.product.findUnique({
      where: { id: req.params.id }, select: { id: true, imageUrl: true },
    });
    if (!existing) return res.status(404).json({ error: 'Produk tidak ditemukan' });

    if (existing.imageUrl) deleteImageFile(existing.imageUrl);

    const product = await prisma.product.update({
      where:   { id: req.params.id },
      data:    { imageUrl: null },
      include: {
        category: true,
        prices: true,
        variants: {
          include: { prices: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    res.json({ ...serializeProduct(product), message: 'Foto berhasil dihapus' });
  } catch (err) { next(err); }
});

// ── PUT /products/:id/price ───────────────────────────────────
router.put('/:id/price', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const { branchId, price } = z.object({
      branchId: z.string().min(1),
      price:    z.number().positive(),
    }).parse(req.body);

    const priceRecord = await prisma.price.upsert({
      where:  { productId_branchId: { productId: req.params.id, branchId } },
      update: { price },
      create: { productId: req.params.id, branchId, price },
    });
    res.json({
      id: priceRecord.id, product_id: priceRecord.productId,
      branch_id: priceRecord.branchId, price: Number(priceRecord.price),
    });
  } catch (err) { next(err); }
});

module.exports = router;
