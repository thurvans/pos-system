const express = require('express');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const { authenticate, authorize } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');
const { AppError } = require('../../utils/errors');
const {
  VARIANT_CATEGORY_KEYWORD,
  supportsProductVariants,
  variantSupportErrorMessage,
} = require('../../utils/productVariantPolicy');

const router = express.Router();

router.use(authenticate, authorize('MANAGER', 'SUPER_ADMIN'));

const canManageVariant = requirePermissions('MENU_VARIANT_MANAGE');
const canManageModifier = requirePermissions('MENU_MODIFIER_MANAGE');
const canManageBundle = requirePermissions('MENU_BUNDLE_MANAGE');

const ensureBranchScope = (req, branchId) => {
  if (req.user.role === 'SUPER_ADMIN') return branchId || null;
  if (!req.user.branchId) throw new AppError('Manager harus terikat cabang', 422);
  if (branchId && branchId !== req.user.branchId) {
    throw new AppError('Forbidden: hanya bisa akses cabang sendiri', 403);
  }
  return req.user.branchId;
};

const parseId = z.string().uuid('ID tidak valid');

const ensureVariantEnabledProduct = (product) => {
  if (!product) {
    throw new AppError('Menu tidak ditemukan', 404);
  }
  if (!supportsProductVariants(product)) {
    throw new AppError(variantSupportErrorMessage(product), 422);
  }
  return product;
};

const getProductForVariantPolicy = async (productId, db = prisma) => db.product.findUnique({
  where: { id: productId },
  select: {
    id: true,
    name: true,
    category: { select: { id: true, name: true } },
  },
});

const getVariantWithProduct = async (variantId, db = prisma) => db.productVariant.findUnique({
  where: { id: variantId },
  select: {
    id: true,
    name: true,
    productId: true,
    product: {
      select: {
        id: true,
        name: true,
        category: { select: { id: true, name: true } },
      },
    },
  },
});

const ensureManagedVariantSupportsPolicy = async (variantId, db = prisma) => {
  const variant = await getVariantWithProduct(variantId, db);
  if (!variant) {
    throw new AppError('Varian tidak ditemukan', 404);
  }
  ensureVariantEnabledProduct(variant.product);
  return variant;
};

const normalizeBundleItems = async (items, db = prisma) => {
  const productIds = [...new Set(items.map((item) => item.productId))];
  const variantIds = [...new Set(items.map((item) => item.variantId).filter(Boolean))];

  const [products, variants] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        category: { select: { id: true, name: true } },
      },
    }),
    variantIds.length
      ? db.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, name: true, productId: true },
      })
      : Promise.resolve([]),
  ]);

  const productMap = Object.fromEntries(products.map((product) => [product.id, product]));
  const variantMap = Object.fromEntries(variants.map((variant) => [variant.id, variant]));

  for (const item of items) {
    const product = productMap[item.productId];
    if (!product) {
      throw new AppError('Terdapat menu bundle yang tidak ditemukan', 404);
    }
    if (!item.variantId) continue;

    const variant = variantMap[item.variantId];
    if (!variant) {
      throw new AppError('Varian bundle tidak ditemukan', 404);
    }
    if (variant.productId !== item.productId) {
      throw new AppError(`Varian "${variant.name}" tidak cocok dengan menu "${product.name}"`, 422);
    }
    ensureVariantEnabledProduct(product);
  }

  return items.map((item) => ({
    ...item,
    variantId: item.variantId || null,
  }));
};

// ----- Variant management
router.get('/variants', canManageVariant, async (req, res, next) => {
  try {
    const productId = req.query.product_id;
    const variants = await prisma.productVariant.findMany({
      where: {
        ...(productId && { productId }),
        product: {
          is: {
            category: {
              is: {
                name: { contains: VARIANT_CATEGORY_KEYWORD, mode: 'insensitive' },
              },
            },
          },
        },
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        prices: {
          include: {
            branch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(variants);
  } catch (err) {
    next(err);
  }
});

router.post('/variants', canManageVariant, async (req, res, next) => {
  try {
    const body = z.object({
      productId: parseId,
      name: z.string().min(1),
      sku: z.string().optional(),
      sortOrder: z.number().int().optional(),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
      branchPrices: z.array(z.object({
        branchId: parseId,
        price: z.number().positive(),
      })).optional(),
    }).parse(req.body);

    const product = await getProductForVariantPolicy(body.productId);
    ensureVariantEnabledProduct(product);

    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: {
          productId: body.productId,
          name: body.name,
          sku: body.sku || null,
          sortOrder: body.sortOrder || 0,
          isDefault: body.isDefault || false,
          isActive: body.isActive ?? true,
        },
      });

      if (body.branchPrices?.length) {
        for (const row of body.branchPrices) {
          const scopedBranchId = ensureBranchScope(req, row.branchId);
          await tx.variantPrice.upsert({
            where: { variantId_branchId: { variantId: variant.id, branchId: scopedBranchId } },
            update: { price: row.price },
            create: { variantId: variant.id, branchId: scopedBranchId, price: row.price },
          });
        }
      }

      return tx.productVariant.findUnique({
        where: { id: variant.id },
        include: { prices: true },
      });
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/variants/:id', canManageVariant, async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1).optional(),
      sku: z.string().nullable().optional(),
      sortOrder: z.number().int().optional(),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    await ensureManagedVariantSupportsPolicy(req.params.id);

    const variant = await prisma.productVariant.update({
      where: { id: req.params.id },
      data: body,
      include: { prices: true },
    });
    res.json(variant);
  } catch (err) {
    next(err);
  }
});

router.patch('/variants/:id/availability', canManageVariant, async (req, res, next) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    await ensureManagedVariantSupportsPolicy(req.params.id);
    const variant = await prisma.productVariant.update({
      where: { id: req.params.id },
      data: { isActive },
      include: { prices: true },
    });
    res.json(variant);
  } catch (err) {
    next(err);
  }
});

router.put('/variants/:id/prices', canManageVariant, async (req, res, next) => {
  try {
    const body = z.object({
      branchId: parseId,
      price: z.number().positive(),
    }).parse(req.body);
    await ensureManagedVariantSupportsPolicy(req.params.id);
    const branchId = ensureBranchScope(req, body.branchId);
    const price = await prisma.variantPrice.upsert({
      where: { variantId_branchId: { variantId: req.params.id, branchId } },
      update: { price: body.price },
      create: { variantId: req.params.id, branchId, price: body.price },
    });
    res.json(price);
  } catch (err) {
    next(err);
  }
});

router.delete('/variants/:id', canManageVariant, async (req, res, next) => {
  try {
    const variant = await prisma.productVariant.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            orderItems: true,
            bundleItems: true,
          },
        },
      },
    });

    if (!variant) {
      throw new AppError('Varian tidak ditemukan', 404);
    }

    if (variant._count.orderItems > 0 || variant._count.bundleItems > 0) {
      throw new AppError('Varian sudah dipakai transaksi atau bundle dan tidak bisa dihapus', 422);
    }

    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { variantId: req.params.id } });
      await tx.variantPrice.deleteMany({ where: { variantId: req.params.id } });
      await tx.productVariant.delete({ where: { id: req.params.id } });
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ----- Modifier group & options
router.get('/modifier-groups', canManageModifier, async (req, res, next) => {
  try {
    const productId = req.query.product_id;
    const groups = await prisma.modifierGroup.findMany({
      where: productId
        ? { products: { some: { productId } } }
        : {},
      include: {
        options: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        products: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(groups);
  } catch (err) {
    next(err);
  }
});

router.post('/modifier-groups', canManageModifier, async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      inputType: z.enum(['SINGLE', 'MULTIPLE']).optional(),
      minSelect: z.number().int().min(0).optional(),
      maxSelect: z.number().int().min(0).optional(),
      isRequired: z.boolean().optional(),
      isActive: z.boolean().optional(),
      productIds: z.array(parseId).optional(),
    }).parse(req.body);

    const group = await prisma.modifierGroup.create({
      data: {
        name: body.name,
        inputType: body.inputType || 'MULTIPLE',
        minSelect: body.minSelect ?? 0,
        maxSelect: body.maxSelect ?? 0,
        isRequired: body.isRequired || false,
        isActive: body.isActive ?? true,
        ...(body.productIds?.length && {
          products: {
            create: body.productIds.map((productId, idx) => ({
              productId,
              sortOrder: idx + 1,
            })),
          },
        }),
      },
      include: {
        options: true,
        products: true,
      },
    });

    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
});

router.put('/modifier-groups/:id', canManageModifier, async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1).optional(),
      inputType: z.enum(['SINGLE', 'MULTIPLE']).optional(),
      minSelect: z.number().int().min(0).optional(),
      maxSelect: z.number().int().min(0).optional(),
      isRequired: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const group = await prisma.modifierGroup.update({
      where: { id: req.params.id },
      data: body,
      include: { options: true, products: true },
    });
    res.json(group);
  } catch (err) {
    next(err);
  }
});

router.delete('/modifier-groups/:id', canManageModifier, async (req, res, next) => {
  try {
    const group = await prisma.modifierGroup.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!group) {
      throw new AppError('Modifier group tidak ditemukan', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.productModifierGroup.deleteMany({ where: { modifierGroupId: req.params.id } });
      await tx.modifierOption.deleteMany({ where: { modifierGroupId: req.params.id } });
      await tx.modifierGroup.delete({ where: { id: req.params.id } });
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/modifier-groups/:id/options', canManageModifier, async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      priceDelta: z.number().optional(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const option = await prisma.modifierOption.create({
      data: {
        modifierGroupId: req.params.id,
        name: body.name,
        priceDelta: body.priceDelta ?? 0,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
      },
    });
    res.status(201).json(option);
  } catch (err) {
    next(err);
  }
});

router.put('/modifier-options/:id', canManageModifier, async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1).optional(),
      priceDelta: z.number().optional(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);
    const option = await prisma.modifierOption.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json(option);
  } catch (err) {
    next(err);
  }
});

router.delete('/modifier-options/:id', canManageModifier, async (req, res, next) => {
  try {
    await prisma.modifierOption.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/product-modifier-groups', canManageModifier, async (req, res, next) => {
  try {
    const body = z.object({
      productId: parseId,
      modifierGroupId: parseId,
      sortOrder: z.number().int().optional(),
    }).parse(req.body);
    const row = await prisma.productModifierGroup.upsert({
      where: {
        productId_modifierGroupId: {
          productId: body.productId,
          modifierGroupId: body.modifierGroupId,
        },
      },
      update: { sortOrder: body.sortOrder ?? 0 },
      create: {
        productId: body.productId,
        modifierGroupId: body.modifierGroupId,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/product-modifier-groups/:id', canManageModifier, async (req, res, next) => {
  try {
    await prisma.productModifierGroup.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ----- Bundle / package management
router.get('/bundles', canManageBundle, async (req, res, next) => {
  try {
    const active = req.query.active;
    const bundles = await prisma.bundle.findMany({
      where: active === undefined ? {} : { isActive: active === 'true' },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(bundles);
  } catch (err) {
    next(err);
  }
});

router.post('/bundles', canManageBundle, async (req, res, next) => {
  try {
    const body = z.object({
      code: z.string().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      bundlePrice: z.number().positive(),
      isActive: z.boolean().optional(),
      startAt: z.string().datetime().optional(),
      endAt: z.string().datetime().optional(),
      items: z.array(z.object({
        productId: parseId,
        variantId: parseId.optional(),
        quantity: z.number().int().positive().optional(),
      })).min(1),
    }).parse(req.body);
    const items = await normalizeBundleItems(body.items);

    const bundle = await prisma.bundle.create({
      data: {
        code: body.code || null,
        name: body.name,
        description: body.description || null,
        bundlePrice: body.bundlePrice,
        isActive: body.isActive ?? true,
        startAt: body.startAt ? new Date(body.startAt) : null,
        endAt: body.endAt ? new Date(body.endAt) : null,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity || 1,
          })),
        },
      },
      include: { items: true },
    });
    res.status(201).json(bundle);
  } catch (err) {
    next(err);
  }
});

router.put('/bundles/:id', canManageBundle, async (req, res, next) => {
  try {
    const body = z.object({
      code: z.string().nullable().optional(),
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      bundlePrice: z.number().positive().optional(),
      isActive: z.boolean().optional(),
      startAt: z.string().datetime().nullable().optional(),
      endAt: z.string().datetime().nullable().optional(),
      items: z.array(z.object({
        productId: parseId,
        variantId: parseId.optional(),
        quantity: z.number().int().positive().optional(),
      })).optional(),
    }).parse(req.body);
    const items = body.items ? await normalizeBundleItems(body.items) : null;

    const bundle = await prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.bundleItem.deleteMany({ where: { bundleId: req.params.id } });
      }
      return tx.bundle.update({
        where: { id: req.params.id },
        data: {
          ...(body.code !== undefined && { code: body.code }),
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.bundlePrice !== undefined && { bundlePrice: body.bundlePrice }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.startAt !== undefined && { startAt: body.startAt ? new Date(body.startAt) : null }),
          ...(body.endAt !== undefined && { endAt: body.endAt ? new Date(body.endAt) : null }),
          ...(items && {
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                variantId: item.variantId || null,
                quantity: item.quantity || 1,
              })),
            },
          }),
        },
        include: { items: true },
      });
    });

    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.patch('/bundles/:id/availability', canManageBundle, async (req, res, next) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const bundle = await prisma.bundle.update({
      where: { id: req.params.id },
      data: { isActive },
    });
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.delete('/bundles/:id', canManageBundle, async (req, res, next) => {
  try {
    const bundle = await prisma.bundle.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            promotionTargets: true,
          },
        },
      },
    });

    if (!bundle) {
      throw new AppError('Bundle tidak ditemukan', 404);
    }

    if (bundle._count.promotionTargets > 0) {
      throw new AppError('Bundle sedang dipakai promo dan tidak bisa dihapus', 422);
    }

    await prisma.$transaction(async (tx) => {
      await tx.bundleItem.deleteMany({ where: { bundleId: req.params.id } });
      await tx.bundle.delete({ where: { id: req.params.id } });
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
