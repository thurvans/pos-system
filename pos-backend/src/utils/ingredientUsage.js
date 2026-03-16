const prisma = require('../config/prisma');
const { AppError } = require('./errors');
const { resolveIngredientCostMap } = require('./hpp');

const ORDER_USAGE_REF_PREFIX = 'ORDER_USAGE:';
const ORDER_RETURN_REF_PREFIX = 'ORDER_RETURN:';
const buildRecipeScopeKey = (productId, variantId = null) => `${productId}:${variantId || 'base'}`;

const roundQty = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

const getOrderUsageRef = (orderId) => `${ORDER_USAGE_REF_PREFIX}${orderId}`;
const getOrderReturnRef = (orderId) => `${ORDER_RETURN_REF_PREFIX}${orderId}`;

const getOrderRecipeUsage = async ({ orderId, db = prisma }) => {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      branchId: true,
      receiptNumber: true,
      items: {
        select: {
          productId: true,
          variantId: true,
          quantity: true,
        },
      },
    },
  });

  if (!order) throw new AppError('Order tidak ditemukan', 404);

  const productIds = [...new Set((order.items || []).map((item) => item.productId).filter(Boolean))];
  if (!productIds.length) {
    return { order, usageRows: [] };
  }

  const recipeItems = await db.recipeItem.findMany({
    where: { productId: { in: productIds } },
    select: {
      productId: true,
      variantId: true,
      ingredientId: true,
      quantity: true,
      lossFactor: true,
    },
  });

  if (!recipeItems.length) {
    return { order, usageRows: [] };
  }

  const recipeMap = new Map();
  for (const row of recipeItems) {
    const scopeKey = buildRecipeScopeKey(row.productId, row.variantId || null);
    if (!recipeMap.has(scopeKey)) recipeMap.set(scopeKey, []);
    recipeMap.get(scopeKey).push(row);
  }

  const usageMap = new Map();
  for (const item of order.items || []) {
    const variantRecipes = item.variantId
      ? recipeMap.get(buildRecipeScopeKey(item.productId, item.variantId)) || []
      : [];
    const productRecipes = variantRecipes.length > 0
      ? variantRecipes
      : (recipeMap.get(buildRecipeScopeKey(item.productId, null)) || []);

    for (const recipe of productRecipes) {
      const baseQty = Number(recipe.quantity || 0);
      const lossFactor = Number(recipe.lossFactor || 0);
      const effectiveQty = roundQty(baseQty * (1 + (lossFactor / 100)) * Number(item.quantity || 0));
      if (effectiveQty <= 0) continue;
      usageMap.set(
        recipe.ingredientId,
        roundQty((usageMap.get(recipe.ingredientId) || 0) + effectiveQty)
      );
    }
  }

  return {
    order,
    usageRows: [...usageMap.entries()].map(([ingredientId, quantity]) => ({
      ingredientId,
      quantity,
    })),
  };
};

const applyIngredientUsageForOrder = async ({ orderId, actorUserId = null, db = prisma }) => {
  const usageRef = getOrderUsageRef(orderId);
  const existingUsage = await db.ingredientMovement.count({
    where: {
      refId: usageRef,
      type: 'USAGE',
    },
  });

  if (existingUsage > 0) {
    return { applied: false, reason: 'already_applied' };
  }

  const { order, usageRows } = await getOrderRecipeUsage({ orderId, db });
  if (!usageRows.length) {
    return { applied: false, reason: 'no_recipe_usage' };
  }

  const ingredientIds = usageRows.map((row) => row.ingredientId);
  const costMap = await resolveIngredientCostMap({
    ingredientIds,
    branchId: order.branchId,
    db,
  });

  for (const row of usageRows) {
    const currentStock = await db.ingredientStock.findUnique({
      where: {
        ingredientId_branchId: {
          ingredientId: row.ingredientId,
          branchId: order.branchId,
        },
      },
    });

    const previousQty = currentStock?.quantity != null ? Number(currentStock.quantity) : 0;
    const nextQty = roundQty(previousQty - row.quantity);

    await db.ingredientStock.upsert({
      where: {
        ingredientId_branchId: {
          ingredientId: row.ingredientId,
          branchId: order.branchId,
        },
      },
      update: {
        quantity: nextQty,
      },
      create: {
        ingredientId: row.ingredientId,
        branchId: order.branchId,
        quantity: nextQty,
      },
    });

    const costEntry = costMap.get(row.ingredientId) || null;
    await db.ingredientMovement.create({
      data: {
        ingredientId: row.ingredientId,
        branchId: order.branchId,
        type: 'USAGE',
        quantity: -row.quantity,
        unitCost: costEntry?.unitCost ?? null,
        refId: usageRef,
        createdBy: actorUserId,
        note: `Auto recipe usage for order ${order.receiptNumber || order.id}`,
      },
    });
  }

  return {
    applied: true,
    reason: 'usage_recorded',
    ingredientCount: usageRows.length,
  };
};

const restoreIngredientUsageForOrder = async ({ orderId, actorUserId = null, db = prisma }) => {
  const usageRef = getOrderUsageRef(orderId);
  const returnRef = getOrderReturnRef(orderId);

  const existingReturn = await db.ingredientMovement.count({
    where: {
      refId: returnRef,
      type: 'RETURN',
    },
  });
  if (existingReturn > 0) {
    return { restored: false, reason: 'already_restored' };
  }

  const usageMovements = await db.ingredientMovement.findMany({
    where: {
      refId: usageRef,
      type: 'USAGE',
    },
    select: {
      ingredientId: true,
      quantity: true,
      unitCost: true,
      branchId: true,
    },
  });

  if (!usageMovements.length) {
    return { restored: false, reason: 'no_usage_found' };
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, receiptNumber: true },
  });
  if (!order) throw new AppError('Order tidak ditemukan', 404);

  for (const movement of usageMovements) {
    const quantity = Math.abs(Number(movement.quantity || 0));
    if (quantity <= 0) continue;

    const currentStock = await db.ingredientStock.findUnique({
      where: {
        ingredientId_branchId: {
          ingredientId: movement.ingredientId,
          branchId: movement.branchId,
        },
      },
    });

    const previousQty = currentStock?.quantity != null ? Number(currentStock.quantity) : 0;
    const nextQty = roundQty(previousQty + quantity);

    await db.ingredientStock.upsert({
      where: {
        ingredientId_branchId: {
          ingredientId: movement.ingredientId,
          branchId: movement.branchId,
        },
      },
      update: {
        quantity: nextQty,
      },
      create: {
        ingredientId: movement.ingredientId,
        branchId: movement.branchId,
        quantity: nextQty,
      },
    });

    await db.ingredientMovement.create({
      data: {
        ingredientId: movement.ingredientId,
        branchId: movement.branchId,
        type: 'RETURN',
        quantity,
        unitCost: movement.unitCost,
        refId: returnRef,
        createdBy: actorUserId,
        note: `Auto stock restore for order ${order.receiptNumber || order.id}`,
      },
    });
  }

  return {
    restored: true,
    reason: 'stock_restored',
    ingredientCount: usageMovements.length,
  };
};

module.exports = {
  applyIngredientUsageForOrder,
  restoreIngredientUsageForOrder,
  getOrderUsageRef,
  getOrderReturnRef,
};
