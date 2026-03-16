const prisma = require('../config/prisma');
const { buildBusinessDateRange, toBusinessDateKey } = require('./businessDate');

const RECEIPT_PREFIX = 'INV';

/**
 * Generate metadata nomor struk dan antrian unik per cabang per hari bisnis.
 * Format struk: {PREFIX}-{YYYYMMDD}-{SEQUENCE}
 * Format antrian: {SEQUENCE}
 */
const generateReceiptMetadata = async (branchId, db = prisma) => {
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { name: true },
  });

  if (!branch) throw new Error(`Branch ${branchId} tidak ditemukan`);

  const businessDateKey = toBusinessDateKey();
  const dateStr = businessDateKey.replace(/-/g, '');
  const createdAt = buildBusinessDateRange({
    dateFrom: businessDateKey,
    dateTo: businessDateKey,
  });

  const count = await db.order.count({
    where: {
      branchId,
      ...(createdAt ? { createdAt } : {}),
    },
  });

  const sequence = String(count + 1).padStart(4, '0');
  return {
    receiptNumber: `${RECEIPT_PREFIX}-${dateStr}-${sequence}`,
    queueNumber: sequence,
    sequence,
    businessDateKey,
  };
};

const generateReceiptNumber = async (branchId, db = prisma) => {
  const { receiptNumber } = await generateReceiptMetadata(branchId, db);
  return receiptNumber;
};

module.exports = { generateReceiptMetadata, generateReceiptNumber };
