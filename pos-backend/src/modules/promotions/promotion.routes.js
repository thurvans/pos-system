const express = require('express');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const { authenticate, authorize, requireBranchAccess } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');
const { AppError } = require('../../utils/errors');

const router = express.Router();

const parseId = z.string().uuid('ID tidak valid');
const promotionTypeEnum = z.enum(['PERCENTAGE', 'NOMINAL', 'HAPPY_HOUR', 'BUNDLE', 'BUY_ONE_GET_ONE']);
const valueTypeEnum = z.enum(['PERCENTAGE', 'NOMINAL']);
const targetTypeEnum = z.enum(['ORDER', 'PRODUCT', 'CATEGORY', 'BUNDLE']);

const resolveBranchId = (req, branchId) => {
  if (req.user.role === 'SUPER_ADMIN') return branchId || null;
  if (!req.user.branchId) throw new AppError('Manager harus terikat cabang', 422);
  if (branchId && branchId !== req.user.branchId) {
    throw new AppError('Forbidden: hanya bisa akses cabang sendiri', 403);
  }
  return req.user.branchId;
};

const targetSchema = z.object({
  targetType: targetTypeEnum,
  targetId: z.string().min(1),
  minQty: z.number().int().positive().optional(),
  branchId: parseId.optional(),
  productId: parseId.optional(),
  categoryId: parseId.optional(),
  bundleId: parseId.optional(),
});

const promotionSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  type: promotionTypeEnum,
  valueType: valueTypeEnum.optional(),
  value: z.number().nonnegative().optional(),
  buyQty: z.number().int().positive().optional(),
  getQty: z.number().int().positive().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  isActive: z.boolean().optional(),
  branchId: parseId.optional(),
  targets: z.array(targetSchema).optional(),
});

const checkoutItemSchema = z.object({
  productId: parseId,
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  subtotal: z.number().nonnegative().optional(),
  categoryId: parseId.optional(),
});

const previewSchema = z.object({
  branchId: parseId.optional(),
  promotionId: parseId,
  subtotal: z.number().nonnegative().optional(),
  items: z.array(checkoutItemSchema).min(1),
});

const resolveRuntimeBranchId = (req, branchId) => {
  if (req.user.role === 'SUPER_ADMIN') {
    if (branchId) return branchId;
    if (req.user.branchId) return req.user.branchId;
    throw new AppError('branch_id wajib untuk super admin', 422);
  }
  if (!req.user.branchId) throw new AppError('User harus terikat cabang', 422);
  if (branchId && branchId !== req.user.branchId) {
    throw new AppError('Forbidden: hanya bisa akses cabang sendiri', 403);
  }
  return req.user.branchId;
};

const toNumber = (value) => Number(value || 0);

const normalizePromotionForCheckout = (promotion) => ({
  id: promotion.id,
  code: promotion.code,
  name: promotion.name,
  description: promotion.description,
  type: promotion.type,
  valueType: promotion.valueType,
  value: promotion.value != null ? toNumber(promotion.value) : null,
  buyQty: promotion.buyQty,
  getQty: promotion.getQty,
  startAt: promotion.startAt?.toISOString?.() || promotion.startAt,
  endAt: promotion.endAt?.toISOString?.() || promotion.endAt,
  branchId: promotion.branchId || null,
  targets: (promotion.targets || []).map((target) => ({
    id: target.id,
    targetType: target.targetType,
    targetId: target.targetId,
    minQty: target.minQty,
    productId: target.productId || null,
    categoryId: target.categoryId || null,
    bundleId: target.bundleId || null,
  })),
});

const lineSubtotal = (item) =>
  item.subtotal != null ? toNumber(item.subtotal) : toNumber(item.unitPrice) * toNumber(item.quantity);

const isTargetMatch = (item, target) => {
  if (target.targetType === 'ORDER') return true;
  if (target.targetType === 'PRODUCT') {
    const targetProductId = target.productId || target.targetId;
    return item.productId === targetProductId;
  }
  if (target.targetType === 'CATEGORY') {
    const targetCategoryId = target.categoryId || target.targetId;
    return Boolean(item.categoryId) && item.categoryId === targetCategoryId;
  }
  return false;
};

const evaluatePromotionDiscount = ({ promotion, items, subtotal }) => {
  const safeSubtotal = Math.max(0, toNumber(subtotal));
  if (!safeSubtotal) {
    return {
      eligible: false,
      baseAmount: 0,
      eligibleQty: 0,
      discountAmount: 0,
      reason: 'Subtotal order tidak valid',
    };
  }

  const targets = promotion.targets || [];
  let eligibleItems = [];

  if (!targets.length) {
    eligibleItems = items;
  } else {
    const merged = new Map();
    for (const target of targets) {
      const matched = items.filter((item) => isTargetMatch(item, target));
      const qty = matched.reduce((sum, item) => sum + item.quantity, 0);
      const minQty = Math.max(1, Number(target.minQty || 1));
      if (qty < minQty) continue;
      for (const item of matched) {
        merged.set(item.productId, item);
      }
    }
    eligibleItems = [...merged.values()];
  }

  const baseAmount = eligibleItems.reduce((sum, item) => sum + lineSubtotal(item), 0);
  const eligibleQty = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);

  if (!eligibleItems.length || baseAmount <= 0) {
    return {
      eligible: false,
      baseAmount,
      eligibleQty,
      discountAmount: 0,
      reason: 'Item keranjang belum memenuhi target promo',
    };
  }

  let discountAmount = 0;

  if (promotion.type === 'BUY_ONE_GET_ONE') {
    const buyQty = Math.max(1, Number(promotion.buyQty || 1));
    const getQty = Math.max(1, Number(promotion.getQty || 1));
    const packageQty = buyQty + getQty;
    const freeQty = Math.floor(eligibleQty / packageQty) * getQty;

    if (freeQty <= 0) {
      return {
        eligible: false,
        baseAmount,
        eligibleQty,
        discountAmount: 0,
        reason: `Minimal ${packageQty} item untuk promo B1G1`,
      };
    }

    const avgUnitPrice = baseAmount / Math.max(eligibleQty, 1);
    discountAmount = freeQty * avgUnitPrice;
  } else {
    const value = toNumber(promotion.value);
    if (value <= 0) {
      return {
        eligible: false,
        baseAmount,
        eligibleQty,
        discountAmount: 0,
        reason: 'Nilai promo belum dikonfigurasi',
      };
    }

    if (promotion.valueType === 'PERCENTAGE') {
      discountAmount = baseAmount * (value / 100);
    } else {
      discountAmount = value;
    }
  }

  discountAmount = Math.min(discountAmount, baseAmount, safeSubtotal);
  discountAmount = Number(discountAmount.toFixed(2));

  return {
    eligible: discountAmount > 0,
    baseAmount: Number(baseAmount.toFixed(2)),
    eligibleQty,
    discountAmount,
    reason: discountAmount > 0 ? null : 'Promo tidak menghasilkan diskon',
  };
};

router.get('/active', authenticate, requireBranchAccess(), async (req, res, next) => {
  try {
    const now = new Date();
    const branchId = resolveRuntimeBranchId(req, req.query.branch_id || req.branchId || null);

    const promotions = await prisma.promotion.findMany({
      where: {
        isActive: true,
        startAt: { lte: now },
        endAt: { gte: now },
        OR: [{ branchId }, { branchId: null }],
      },
      include: {
        targets: true,
      },
      orderBy: [{ startAt: 'asc' }, { name: 'asc' }],
    });

    res.json({
      branchId,
      generatedAt: now.toISOString(),
      data: promotions.map(normalizePromotionForCheckout),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/preview', authenticate, requireBranchAccess(), async (req, res, next) => {
  try {
    const now = new Date();
    const body = previewSchema.parse(req.body);
    const branchId = resolveRuntimeBranchId(req, body.branchId || req.branchId || null);

    const promotion = await prisma.promotion.findFirst({
      where: {
        id: body.promotionId,
        isActive: true,
        startAt: { lte: now },
        endAt: { gte: now },
        OR: [{ branchId }, { branchId: null }],
      },
      include: {
        targets: true,
      },
    });

    if (!promotion) {
      throw new AppError('Promo tidak ditemukan atau tidak aktif', 404);
    }

    const productIds = body.items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, categoryId: true },
    });
    const productCategoryMap = new Map(products.map((row) => [row.id, row.categoryId || null]));

    const normalizedItems = body.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      subtotal: item.subtotal != null ? toNumber(item.subtotal) : (toNumber(item.unitPrice) * item.quantity),
      categoryId: item.categoryId || productCategoryMap.get(item.productId) || null,
    }));

    const subtotal = body.subtotal != null
      ? toNumber(body.subtotal)
      : normalizedItems.reduce((sum, item) => sum + lineSubtotal(item), 0);

    const evaluation = evaluatePromotionDiscount({
      promotion,
      items: normalizedItems,
      subtotal,
    });

    res.json({
      branchId,
      subtotal: Number(subtotal.toFixed(2)),
      promotion: normalizePromotionForCheckout(promotion),
      eligible: evaluation.eligible,
      baseAmount: evaluation.baseAmount,
      eligibleQty: evaluation.eligibleQty,
      discountAmount: evaluation.discountAmount,
      totalAfterDiscount: Number(Math.max(0, subtotal - evaluation.discountAmount).toFixed(2)),
      reason: evaluation.reason,
      calculatedAt: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.use(
  authenticate,
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('PROMO_MANAGE'),
);

router.get('/', async (req, res, next) => {
  try {
    const active = req.query.active;
    const type = req.query.type;
    const branchId = resolveBranchId(req, req.query.branch_id);

    const promotions = await prisma.promotion.findMany({
      where: {
        ...(active !== undefined && { isActive: active === 'true' }),
        ...(type && { type }),
        ...(branchId && { branchId }),
      },
      include: {
        targets: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { startAt: 'desc' },
    });

    res.json(promotions);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = promotionSchema.parse(req.body);
    const branchId = resolveBranchId(req, body.branchId);

    const promotion = await prisma.promotion.create({
      data: {
        code: body.code || null,
        name: body.name,
        description: body.description || null,
        type: body.type,
        valueType: body.valueType || null,
        value: body.value ?? null,
        buyQty: body.buyQty ?? null,
        getQty: body.getQty ?? null,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
        isActive: body.isActive ?? true,
        branchId,
        ...(body.targets?.length && {
          targets: {
            create: body.targets.map((target) => ({
              targetType: target.targetType,
              targetId: target.targetId,
              minQty: target.minQty || 1,
              branchId: resolveBranchId(req, target.branchId || branchId),
              productId: target.productId || null,
              categoryId: target.categoryId || null,
              bundleId: target.bundleId || null,
            })),
          },
        }),
      },
      include: { targets: true, branch: { select: { id: true, name: true } } },
    });

    res.status(201).json(promotion);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = promotionSchema.partial().parse(req.body);
    const existing = await prisma.promotion.findUnique({
      where: { id: req.params.id },
      select: { id: true, branchId: true },
    });
    if (!existing) throw new AppError('Promo tidak ditemukan', 404);

    resolveBranchId(req, existing.branchId || body.branchId);

    const result = await prisma.$transaction(async (tx) => {
      if (body.targets) {
        await tx.promotionTarget.deleteMany({ where: { promotionId: req.params.id } });
      }

      return tx.promotion.update({
        where: { id: req.params.id },
        data: {
          ...(body.code !== undefined && { code: body.code || null }),
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description || null }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.valueType !== undefined && { valueType: body.valueType || null }),
          ...(body.value !== undefined && { value: body.value }),
          ...(body.buyQty !== undefined && { buyQty: body.buyQty }),
          ...(body.getQty !== undefined && { getQty: body.getQty }),
          ...(body.startAt !== undefined && { startAt: new Date(body.startAt) }),
          ...(body.endAt !== undefined && { endAt: new Date(body.endAt) }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.branchId !== undefined && { branchId: resolveBranchId(req, body.branchId) }),
          ...(body.targets && {
            targets: {
              create: body.targets.map((target) => ({
                targetType: target.targetType,
                targetId: target.targetId,
                minQty: target.minQty || 1,
                branchId: resolveBranchId(req, target.branchId || body.branchId || existing.branchId),
                productId: target.productId || null,
                categoryId: target.categoryId || null,
                bundleId: target.bundleId || null,
              })),
            },
          }),
        },
        include: { targets: true, branch: { select: { id: true, name: true } } },
      });
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/active', async (req, res, next) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const existing = await prisma.promotion.findUnique({
      where: { id: req.params.id },
      select: { id: true, branchId: true },
    });
    if (!existing) throw new AppError('Promo tidak ditemukan', 404);
    resolveBranchId(req, existing.branchId);

    const promotion = await prisma.promotion.update({
      where: { id: req.params.id },
      data: { isActive },
    });
    res.json(promotion);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.promotion.findUnique({
      where: { id: req.params.id },
      select: { id: true, branchId: true },
    });
    if (!existing) throw new AppError('Promo tidak ditemukan', 404);
    resolveBranchId(req, existing.branchId);

    await prisma.$transaction(async (tx) => {
      await tx.promotionTarget.deleteMany({ where: { promotionId: req.params.id } });
      await tx.promotion.delete({ where: { id: req.params.id } });
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
