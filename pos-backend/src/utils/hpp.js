const prisma = require('../config/prisma');

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const toNumber = (value) => (value == null ? 0 : Number(value));

const toTimestamp = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const sortPurchaseRows = (rows = []) => (
  [...rows].sort((left, right) => {
    const rightTime = toTimestamp(right.purchaseOrder?.receivedAt || right.purchaseOrder?.createdAt);
    const leftTime = toTimestamp(left.purchaseOrder?.receivedAt || left.purchaseOrder?.createdAt);
    if (rightTime !== leftTime) return rightTime - leftTime;
    return String(right.id || '').localeCompare(String(left.id || ''));
  })
);

const assignFirstResolvedCost = (targetMap, rows, transform) => {
  for (const row of rows) {
    if (!row?.ingredientId || targetMap.has(row.ingredientId)) continue;
    const entry = transform(row);
    if (!entry || !Number.isFinite(entry.unitCost)) continue;
    targetMap.set(row.ingredientId, entry);
  }
};

const createEmptySummary = (branchId = null, variantId = null, { includeVariantSummaries = false } = {}) => ({
  branchId,
  variantId,
  estimatedCost: 0,
  recipeConfigured: false,
  recipeItemsCount: 0,
  missingCostCount: 0,
  fullyCosted: false,
  ...(includeVariantSummaries ? { variantSummaries: {} } : {}),
});

const finalizeSummary = (summary) => {
  if (!summary) return summary;
  summary.estimatedCost = roundMoney(summary.estimatedCost);
  summary.fullyCosted = summary.recipeConfigured && summary.missingCostCount === 0;
  return summary;
};

const resolveScopedProductSummary = (productSummary, variantId = null) => {
  if (variantId && productSummary?.variantSummaries?.[variantId]?.recipeConfigured) {
    return productSummary.variantSummaries[variantId];
  }
  return productSummary || null;
};

const resolveIngredientCostMap = async ({ ingredientIds, branchId = null, db = prisma }) => {
  const ids = [...new Set((ingredientIds || []).filter(Boolean))];
  const costMap = new Map();

  if (ids.length === 0) return costMap;

  if (branchId) {
    const branchMovements = await db.ingredientMovement.findMany({
      where: {
        ingredientId: { in: ids },
        branchId,
        unitCost: { not: null },
      },
      select: {
        id: true,
        ingredientId: true,
        unitCost: true,
        createdAt: true,
        branchId: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    assignFirstResolvedCost(costMap, branchMovements, (row) => ({
      unitCost: toNumber(row.unitCost),
      source: 'movement',
      branchId: row.branchId,
      effectiveAt: row.createdAt,
    }));
  }

  let unresolved = ids.filter((id) => !costMap.has(id));
  if (unresolved.length > 0) {
    const branchPurchases = await db.purchaseOrderItem.findMany({
      where: {
        ingredientId: { in: unresolved },
        purchaseOrder: {
          status: 'RECEIVED',
          ...(branchId ? { branchId } : {}),
        },
      },
      select: {
        id: true,
        ingredientId: true,
        unitCost: true,
        purchaseOrder: {
          select: {
            branchId: true,
            createdAt: true,
            receivedAt: true,
          },
        },
      },
    });

    assignFirstResolvedCost(costMap, sortPurchaseRows(branchPurchases), (row) => ({
      unitCost: toNumber(row.unitCost),
      source: 'purchase_order',
      branchId: row.purchaseOrder?.branchId || branchId || null,
      effectiveAt: row.purchaseOrder?.receivedAt || row.purchaseOrder?.createdAt || null,
    }));
  }

  unresolved = ids.filter((id) => !costMap.has(id));
  if (branchId && unresolved.length > 0) {
    const globalMovements = await db.ingredientMovement.findMany({
      where: {
        ingredientId: { in: unresolved },
        unitCost: { not: null },
      },
      select: {
        id: true,
        ingredientId: true,
        unitCost: true,
        createdAt: true,
        branchId: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    assignFirstResolvedCost(costMap, globalMovements, (row) => ({
      unitCost: toNumber(row.unitCost),
      source: 'movement',
      branchId: row.branchId,
      effectiveAt: row.createdAt,
    }));
  }

  unresolved = ids.filter((id) => !costMap.has(id));
  if (unresolved.length > 0) {
    const globalPurchases = await db.purchaseOrderItem.findMany({
      where: {
        ingredientId: { in: unresolved },
        purchaseOrder: {
          status: 'RECEIVED',
        },
      },
      select: {
        id: true,
        ingredientId: true,
        unitCost: true,
        purchaseOrder: {
          select: {
            branchId: true,
            createdAt: true,
            receivedAt: true,
          },
        },
      },
    });

    assignFirstResolvedCost(costMap, sortPurchaseRows(globalPurchases), (row) => ({
      unitCost: toNumber(row.unitCost),
      source: 'purchase_order',
      branchId: row.purchaseOrder?.branchId || null,
      effectiveAt: row.purchaseOrder?.receivedAt || row.purchaseOrder?.createdAt || null,
    }));
  }

  return costMap;
};

const buildProductHppSummaryMap = async ({ productIds, branchId = null, db = prisma }) => {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  const recipeItems = await db.recipeItem.findMany({
    where: { productId: { in: ids } },
    select: {
      id: true,
      productId: true,
      variantId: true,
      ingredientId: true,
      quantity: true,
      lossFactor: true,
    },
  });

  const summaryMap = Object.fromEntries(ids.map((id) => [id, createEmptySummary(branchId, null, {
    includeVariantSummaries: true,
  })]));

  if (recipeItems.length === 0) {
    return summaryMap;
  }

  const ingredientCostMap = await resolveIngredientCostMap({
    ingredientIds: recipeItems.map((item) => item.ingredientId),
    branchId,
    db,
  });

  for (const item of recipeItems) {
    const productSummary = summaryMap[item.productId];
    if (!productSummary) continue;

    const targetSummary = item.variantId
      ? (
        productSummary.variantSummaries[item.variantId]
        || (productSummary.variantSummaries[item.variantId] = createEmptySummary(branchId, item.variantId))
      )
      : productSummary;

    const baseQty = toNumber(item.quantity);
    const lossFactorPct = toNumber(item.lossFactor);
    const effectiveQty = baseQty * (1 + (lossFactorPct / 100));
    const costEntry = ingredientCostMap.get(item.ingredientId);

    targetSummary.recipeConfigured = true;
    targetSummary.recipeItemsCount += 1;

    if (!costEntry) {
      targetSummary.missingCostCount += 1;
      continue;
    }

    targetSummary.estimatedCost += effectiveQty * costEntry.unitCost;
  }

  for (const summary of Object.values(summaryMap)) {
    finalizeSummary(summary);
    for (const variantSummary of Object.values(summary.variantSummaries || {})) {
      finalizeSummary(variantSummary);
    }
  }

  return summaryMap;
};

const buildRecipeCostBreakdown = async ({ productId, variantId = null, branchId = null, db = prisma }) => {
  const recipeItems = await db.recipeItem.findMany({
    where: {
      productId,
      variantId: variantId || null,
    },
    include: {
      ingredient: {
        include: {
          unit: true,
          stocks: branchId ? { where: { branchId } } : false,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  recipeItems.sort((left, right) => (
    String(left.ingredient?.name || '').localeCompare(String(right.ingredient?.name || ''))
    || toTimestamp(left.createdAt) - toTimestamp(right.createdAt)
  ));

  const ingredientCostMap = await resolveIngredientCostMap({
    ingredientIds: recipeItems.map((item) => item.ingredientId),
    branchId,
    db,
  });

  let estimatedCost = 0;
  const items = recipeItems.map((item) => {
    const baseQty = toNumber(item.quantity);
    const lossFactor = toNumber(item.lossFactor);
    const effectiveQty = baseQty * (1 + (lossFactor / 100));
    const costEntry = ingredientCostMap.get(item.ingredientId) || null;
    const unitCost = costEntry ? toNumber(costEntry.unitCost) : null;
    const subtotal = unitCost == null ? 0 : roundMoney(effectiveQty * unitCost);
    const stockQty = Array.isArray(item.ingredient?.stocks) && item.ingredient.stocks.length > 0
      ? toNumber(item.ingredient.stocks[0]?.quantity)
      : null;

    estimatedCost += subtotal;

    return {
      id: item.id,
      productId,
      variantId: item.variantId || null,
      ingredientId: item.ingredientId,
      ingredient: item.ingredient
        ? {
          id: item.ingredient.id,
          sku: item.ingredient.sku ?? null,
          name: item.ingredient.name,
          unit: item.ingredient.unit
            ? {
              id: item.ingredient.unit.id,
              code: item.ingredient.unit.code,
              name: item.ingredient.unit.name,
            }
            : null,
          minStock: toNumber(item.ingredient.minStock),
          stockQty,
        }
        : null,
      quantity: baseQty,
      lossFactor,
      effectiveQty: Number(effectiveQty.toFixed(3)),
      unitCost,
      costSource: costEntry?.source || null,
      costEffectiveAt: costEntry?.effectiveAt || null,
      subtotal,
    };
  });

  const missingCostCount = items.filter((item) => item.unitCost == null).length;

  return {
    productId,
    variantId: variantId || null,
    branchId,
    recipeConfigured: items.length > 0,
    recipeItemsCount: items.length,
    missingCostCount,
    fullyCosted: items.length > 0 && missingCostCount === 0,
    estimatedCost: roundMoney(estimatedCost),
    items,
  };
};

const calculateOrderHppSnapshot = async ({ items, branchId, db = prisma }) => {
  const orderItems = Array.isArray(items) ? items : [];
  if (orderItems.length === 0) {
    return { items: [], totalHpp: 0, productSummaries: {} };
  }

  const productSummaries = await buildProductHppSummaryMap({
    productIds: orderItems.map((item) => item.productId),
    branchId,
    db,
  });

  const itemsWithHpp = orderItems.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const scopedSummary = resolveScopedProductSummary(
      productSummaries[item.productId],
      item.variantId || null
    );
    const estimatedUnitCost = toNumber(scopedSummary?.estimatedCost);

    return {
      ...item,
      hppSubtotal: roundMoney(estimatedUnitCost * quantity),
    };
  });

  return {
    items: itemsWithHpp,
    totalHpp: roundMoney(itemsWithHpp.reduce((sum, item) => sum + toNumber(item.hppSubtotal), 0)),
    productSummaries,
  };
};

module.exports = {
  buildProductHppSummaryMap,
  buildRecipeCostBreakdown,
  calculateOrderHppSnapshot,
  resolveIngredientCostMap,
};
