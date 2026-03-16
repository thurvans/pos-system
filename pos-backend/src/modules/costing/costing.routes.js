const express = require('express');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const { authenticate, authorize } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');
const { AppError } = require('../../utils/errors');
const {
  supportsProductVariants,
  variantSupportErrorMessage,
} = require('../../utils/productVariantPolicy');
const {
  buildProductHppSummaryMap,
  buildRecipeCostBreakdown,
  resolveIngredientCostMap,
} = require('../../utils/hpp');

const router = express.Router();

router.use(authenticate, authorize('MANAGER', 'SUPER_ADMIN'));

const canReadCosting = requirePermissions(
  'MENU_ITEM_MANAGE',
  'INVENTORY_MASTER_MANAGE',
  'INVENTORY_REPORT_VIEW'
);
const canWriteCosting = requirePermissions(
  'MENU_ITEM_MANAGE',
  'INVENTORY_MASTER_MANAGE'
);

const parseId = z.string().uuid('ID tidak valid');

const normalizeBranchId = (req, branchId, { required = false } = {}) => {
  const requestedBranchId = branchId || null;

  if (req.user.role === 'SUPER_ADMIN') {
    if (required && !requestedBranchId) {
      throw new AppError('branchId wajib dipilih', 422);
    }
    return requestedBranchId;
  }

  if (!req.user.branchId) {
    throw new AppError('Akun manager harus terikat cabang', 422);
  }
  if (requestedBranchId && requestedBranchId !== req.user.branchId) {
    throw new AppError('Forbidden: hanya bisa mengakses cabang sendiri', 403);
  }

  return req.user.branchId;
};

const serializeIngredient = (ingredient, latestCostEntry = null, branchId = null) => ({
  id: ingredient.id,
  sku: ingredient.sku ?? null,
  name: ingredient.name,
  min_stock: Number(ingredient.minStock || 0),
  minStock: Number(ingredient.minStock || 0),
  is_active: ingredient.isActive ?? true,
  isActive: ingredient.isActive ?? true,
  unit: ingredient.unit
    ? {
      id: ingredient.unit.id,
      code: ingredient.unit.code,
      name: ingredient.unit.name,
    }
    : null,
  latest_cost: latestCostEntry ? Number(latestCostEntry.unitCost || 0) : null,
  latestCost: latestCostEntry ? Number(latestCostEntry.unitCost || 0) : null,
  latest_cost_source: latestCostEntry?.source || null,
  latestCostSource: latestCostEntry?.source || null,
  latest_cost_effective_at: latestCostEntry?.effectiveAt || null,
  latestCostEffectiveAt: latestCostEntry?.effectiveAt || null,
  stock_qty: ingredient.stocks?.[0]?.quantity != null ? Number(ingredient.stocks[0].quantity) : null,
  stockQty: ingredient.stocks?.[0]?.quantity != null ? Number(ingredient.stocks[0].quantity) : null,
  branch_id: branchId,
  branchId,
});

const serializePrice = (price) => ({
  id: price.id,
  branch_id: price.branchId,
  branchId: price.branchId,
  price: Number(price.price),
});

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
  is_active: variant.isActive ?? true,
  isActive: variant.isActive ?? true,
  prices: (variant.prices || []).map(serializePrice),
  hpp_summary: serializeHppSummary(hppSummary),
  hppSummary: serializeHppSummary(hppSummary),
});

const serializeProduct = (product, hppSummary = null) => {
  const supportsVariants = supportsProductVariants(product);
  const serializedHppSummary = serializeHppSummary(hppSummary, {
    includeVariantSummaries: supportsVariants,
  });

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category ?? null,
    supports_variants: supportsVariants,
    supportsVariants,
    prices: (product.prices || []).map(serializePrice),
    variants: supportsVariants
      ? (product.variants || []).map((variant) => (
        serializeVariant(variant, hppSummary?.variantSummaries?.[variant.id] || null)
      ))
      : [],
    hpp_summary: serializedHppSummary,
    hppSummary: serializedHppSummary,
  };
};

const getRecipeVariantId = (payload) => {
  const candidate = payload?.variant_id || payload?.variantId || null;
  if (!candidate) return null;
  return parseId.parse(candidate);
};

const ingredientSchema = z.object({
  sku: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(1, 'Nama bahan wajib diisi'),
  unitCode: z.string().trim().min(1, 'Unit code wajib diisi'),
  unitName: z.string().trim().optional().nullable(),
  minStock: z.coerce.number().min(0).optional(),
  stockQty: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
  latestCost: z.coerce.number().min(0).optional(),
  branchId: parseId.optional().nullable(),
});

const recipeSchema = z.object({
  branchId: parseId.optional().nullable(),
  variantId: parseId.optional().nullable(),
  items: z.array(z.object({
    ingredientId: parseId,
    quantity: z.coerce.number().positive('Qty bahan harus lebih dari 0'),
    lossFactor: z.coerce.number().min(0).max(1000).optional(),
  })).max(200).default([]),
});

const ensureUnit = async (tx, unitCode, unitName) => {
  const normalizedCode = String(unitCode || '').trim().toUpperCase();
  if (!normalizedCode) {
    throw new AppError('Unit code wajib diisi', 422);
  }

  const existing = await tx.unit.findUnique({
    where: { code: normalizedCode },
  });
  if (existing) return existing;

  return tx.unit.create({
    data: {
      code: normalizedCode,
      name: String(unitName || normalizedCode).trim() || normalizedCode,
    },
  });
};

const createCostMovement = async (tx, { ingredientId, branchId, unitCost, userId }) => {
  if (unitCost == null) return null;
  return tx.ingredientMovement.create({
    data: {
      ingredientId,
      branchId,
      type: 'ADJUSTMENT',
      quantity: 0,
      unitCost,
      createdBy: userId,
      note: 'Manual cost update from Cost & HPP page',
    },
  });
};

const updateIngredientStock = async (tx, { ingredientId, branchId, stockQty, userId }) => {
  if (stockQty == null || !branchId) return null;

  const currentStock = await tx.ingredientStock.findUnique({
    where: {
      ingredientId_branchId: {
        ingredientId,
        branchId,
      },
    },
  });

  const previousQty = currentStock?.quantity != null ? Number(currentStock.quantity) : 0;
  const nextQty = Number(stockQty || 0);
  const deltaQty = nextQty - previousQty;

  await tx.ingredientStock.upsert({
    where: {
      ingredientId_branchId: {
        ingredientId,
        branchId,
      },
    },
    update: {
      quantity: nextQty,
    },
    create: {
      ingredientId,
      branchId,
      quantity: nextQty,
    },
  });

  if (deltaQty === 0) return null;

  return tx.ingredientMovement.create({
    data: {
      ingredientId,
      branchId,
      type: 'ADJUSTMENT',
      quantity: deltaQty,
      createdBy: userId,
      note: currentStock
        ? 'Manual stock update from Cost & HPP page'
        : 'Initial stock set from Cost & HPP page',
    },
  });
};

router.get('/ingredients', canReadCosting, async (req, res, next) => {
  try {
    const branchId = normalizeBranchId(req, req.query.branch_id || req.query.branchId);
    const q = String(req.query.q || '').trim();
    const includeInactive = String(req.query.include_inactive || 'false') === 'true';

    const ingredients = await prisma.ingredient.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(q ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: {
        unit: true,
        stocks: branchId ? { where: { branchId }, take: 1 } : false,
      },
      orderBy: { name: 'asc' },
    });

    const latestCostMap = await resolveIngredientCostMap({
      ingredientIds: ingredients.map((ingredient) => ingredient.id),
      branchId,
      db: prisma,
    });

    res.json(
      ingredients.map((ingredient) => serializeIngredient(
        ingredient,
        latestCostMap.get(ingredient.id) || null,
        branchId
      ))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/ingredients', canWriteCosting, async (req, res, next) => {
  try {
    const body = ingredientSchema.parse(req.body);
    const needsScopedBranch = body.latestCost != null || body.stockQty != null;
    const branchId = needsScopedBranch
      ? normalizeBranchId(req, body.branchId, { required: true })
      : normalizeBranchId(req, body.branchId);

    const ingredient = await prisma.$transaction(async (tx) => {
      const unit = await ensureUnit(tx, body.unitCode, body.unitName);
      const created = await tx.ingredient.create({
        data: {
          sku: body.sku || null,
          name: body.name,
          unitId: unit.id,
          minStock: body.minStock ?? 0,
          isActive: body.isActive ?? true,
        },
        include: { unit: true },
      });

      if (body.latestCost != null && branchId) {
        await createCostMovement(tx, {
          ingredientId: created.id,
          branchId,
          unitCost: body.latestCost,
          userId: req.user.id,
        });
      }

      if (body.stockQty != null && branchId) {
        await updateIngredientStock(tx, {
          ingredientId: created.id,
          branchId,
          stockQty: body.stockQty,
          userId: req.user.id,
        });
      }

      return created;
    });

    const latestCostMap = await resolveIngredientCostMap({
      ingredientIds: [ingredient.id],
      branchId,
      db: prisma,
    });

    res.status(201).json(serializeIngredient(
      ingredient,
      latestCostMap.get(ingredient.id) || null,
      branchId
    ));
  } catch (err) {
    next(err);
  }
});

router.put('/ingredients/:id', canWriteCosting, async (req, res, next) => {
  try {
    const body = ingredientSchema.partial().parse(req.body);
    const needsScopedBranch = body.latestCost != null || body.stockQty != null;
    const branchId = needsScopedBranch
      ? normalizeBranchId(req, body.branchId, { required: true })
      : normalizeBranchId(req, body.branchId);

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.ingredient.findUnique({
        where: { id: req.params.id },
        include: { unit: true },
      });
      if (!current) {
        throw new AppError('Bahan tidak ditemukan', 404);
      }

      const unit = body.unitCode
        ? await ensureUnit(tx, body.unitCode, body.unitName)
        : current.unit;

      const ingredient = await tx.ingredient.update({
        where: { id: req.params.id },
        data: {
          ...(body.sku !== undefined && { sku: body.sku || null }),
          ...(body.name !== undefined && { name: body.name }),
          ...(body.minStock !== undefined && { minStock: body.minStock }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(unit?.id && { unitId: unit.id }),
        },
        include: { unit: true },
      });

      if (body.latestCost != null && branchId) {
        await createCostMovement(tx, {
          ingredientId: ingredient.id,
          branchId,
          unitCost: body.latestCost,
          userId: req.user.id,
        });
      }

      if (body.stockQty != null && branchId) {
        await updateIngredientStock(tx, {
          ingredientId: ingredient.id,
          branchId,
          stockQty: body.stockQty,
          userId: req.user.id,
        });
      }

      return ingredient;
    });

    const latestCostMap = await resolveIngredientCostMap({
      ingredientIds: [updated.id],
      branchId,
      db: prisma,
    });

    res.json(serializeIngredient(
      updated,
      latestCostMap.get(updated.id) || null,
      branchId
    ));
  } catch (err) {
    next(err);
  }
});

router.delete('/ingredients/:id', canWriteCosting, async (req, res, next) => {
  try {
    const branchId = normalizeBranchId(req, req.query.branch_id || req.query.branchId);

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: req.params.id },
      include: {
        unit: true,
        _count: {
          select: {
            recipeItems: true,
            stocks: true,
            movements: true,
            purchaseOrderItems: true,
            stockOpnameItems: true,
          },
        },
      },
    });

    if (!ingredient) {
      throw new AppError('Bahan tidak ditemukan', 404);
    }

    const hasTransactionalHistory = (
      ingredient._count.movements
      + ingredient._count.purchaseOrderItems
      + ingredient._count.stockOpnameItems
    ) > 0;

    if (hasTransactionalHistory) {
      const archived = await prisma.$transaction(async (tx) => {
        await tx.recipeItem.deleteMany({
          where: { ingredientId: ingredient.id },
        });

        return tx.ingredient.update({
          where: { id: ingredient.id },
          data: { isActive: false },
          include: { unit: true, stocks: branchId ? { where: { branchId }, take: 1 } : false },
        });
      });

      const latestCostMap = await resolveIngredientCostMap({
        ingredientIds: [archived.id],
        branchId,
        db: prisma,
      });

      res.json({
        mode: 'archived',
        message: 'Bahan punya histori, jadi diarsipkan dan dilepas dari resep aktif.',
        ingredient: serializeIngredient(
          archived,
          latestCostMap.get(archived.id) || null,
          branchId
        ),
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({
        where: { ingredientId: ingredient.id },
      });
      await tx.ingredientStock.deleteMany({
        where: { ingredientId: ingredient.id },
      });
      await tx.ingredient.delete({
        where: { id: ingredient.id },
      });
    });

    res.json({
      mode: 'deleted',
      message: 'Bahan berhasil dihapus.',
      id: ingredient.id,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/ingredients/:id/cost', canWriteCosting, async (req, res, next) => {
  try {
    const body = z.object({
      branchId: parseId.optional().nullable(),
      latestCost: z.coerce.number().min(0),
    }).parse(req.body);

    const branchId = normalizeBranchId(req, body.branchId, { required: true });

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: req.params.id },
      include: { unit: true },
    });
    if (!ingredient) {
      throw new AppError('Bahan tidak ditemukan', 404);
    }

    await createCostMovement(prisma, {
      ingredientId: ingredient.id,
      branchId,
      unitCost: body.latestCost,
      userId: req.user.id,
    });

    const latestCostMap = await resolveIngredientCostMap({
      ingredientIds: [ingredient.id],
      branchId,
      db: prisma,
    });

    res.json(serializeIngredient(
      ingredient,
      latestCostMap.get(ingredient.id) || null,
      branchId
    ));
  } catch (err) {
    next(err);
  }
});

const loadCostingProduct = async (productId, branchId) => prisma.product.findUnique({
  where: { id: productId },
  include: {
    category: { select: { id: true, name: true } },
    prices: branchId ? { where: { branchId } } : true,
    variants: {
      include: {
        prices: branchId ? { where: { branchId } } : true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    },
  },
});

const ensureRecipeVariantBelongsToProduct = (product, variantId) => {
  if (!variantId) return null;
  if (!supportsProductVariants(product)) {
    throw new AppError(`${variantSupportErrorMessage(product)} untuk resep`, 422);
  }

  const variant = (product?.variants || []).find((row) => row.id === variantId) || null;
  if (!variant) {
    throw new AppError('Varian menu tidak ditemukan untuk resep ini', 422);
  }

  return variant;
};

router.get('/products', canReadCosting, async (req, res, next) => {
  try {
    const branchId = normalizeBranchId(req, req.query.branch_id || req.query.branchId);
    const q = String(req.query.q || '').trim();

    const products = await prisma.product.findMany({
      where: {
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        prices: branchId ? { where: { branchId } } : true,
        variants: {
          include: {
            prices: branchId ? { where: { branchId } } : true,
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    const summaryMap = await buildProductHppSummaryMap({
      productIds: products.map((product) => product.id),
      branchId,
      db: prisma,
    });

    res.json(products.map((product) => serializeProduct(
      product,
      summaryMap[product.id] || null
    )));
  } catch (err) {
    next(err);
  }
});

router.get('/products/:id/recipe', canReadCosting, async (req, res, next) => {
  try {
    const branchId = normalizeBranchId(req, req.query.branch_id || req.query.branchId);
    const variantId = getRecipeVariantId(req.query);

    const product = await loadCostingProduct(req.params.id, branchId);
    if (!product) {
      throw new AppError('Menu tidak ditemukan', 404);
    }

    const selectedVariant = ensureRecipeVariantBelongsToProduct(product, variantId);
    const summaryMap = await buildProductHppSummaryMap({
      productIds: [product.id],
      branchId,
      db: prisma,
    });

    const recipe = await buildRecipeCostBreakdown({
      productId: req.params.id,
      variantId,
      branchId,
      db: prisma,
    });

    res.json({
      product: serializeProduct(product, summaryMap[product.id] || null),
      recipe_scope: {
        type: selectedVariant ? 'variant' : 'base',
        variant_id: selectedVariant?.id || null,
        variantId: selectedVariant?.id || null,
        variant_name: selectedVariant?.name || null,
        variantName: selectedVariant?.name || null,
      },
      ...recipe,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/products/:id/recipe', canWriteCosting, async (req, res, next) => {
  try {
    const body = recipeSchema.parse(req.body);
    const branchId = normalizeBranchId(req, body.branchId);
    const variantId = body.variantId || null;

    const uniqueIngredients = new Set(body.items.map((item) => item.ingredientId));
    if (uniqueIngredients.size !== body.items.length) {
      throw new AppError('Bahan duplikat dalam resep', 422);
    }

    const product = await loadCostingProduct(req.params.id, branchId);
    if (!product) {
      throw new AppError('Menu tidak ditemukan', 404);
    }

    ensureRecipeVariantBelongsToProduct(product, variantId);

    const ingredients = body.items.length
      ? await prisma.ingredient.findMany({
        where: {
          id: { in: body.items.map((item) => item.ingredientId) },
          isActive: true,
        },
        select: { id: true },
      })
      : [];

    if (ingredients.length !== uniqueIngredients.size) {
      throw new AppError('Ada bahan yang tidak ditemukan atau nonaktif', 422);
    }

    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({
        where: {
          productId: req.params.id,
          variantId,
        },
      });

      if (body.items.length > 0) {
        await tx.recipeItem.createMany({
          data: body.items.map((item) => ({
            productId: req.params.id,
            variantId,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            lossFactor: item.lossFactor ?? 0,
          })),
        });
      }
    });

    const recipe = await buildRecipeCostBreakdown({
      productId: req.params.id,
      variantId,
      branchId,
      db: prisma,
    });

    res.json(recipe);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
