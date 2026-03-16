const express  = require('express');
const router   = express.Router();
const { authenticate, requireBranchAccess } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');
const prisma   = require('../../config/prisma');
const { getShiftSummaryService } = require('../shifts/shift.service');
const {
  toBusinessDateKey,
  shiftBusinessDateKey,
  buildBusinessDateRange,
} = require('../../utils/businessDate');

router.use(authenticate, requireBranchAccess());

const REVENUE_STATUSES = ['PAID'];

// ─── Helper ───────────────────────────────────────────────────

const buildOrderWhere = ({ branch_id, date_from, date_to }) => {
  const createdAt = buildBusinessDateRange({ dateFrom: date_from, dateTo: date_to });
  return {
    status: { in: REVENUE_STATUSES },
    ...(createdAt && { createdAt }),
    ...(branch_id && { branchId: branch_id }),
  };
};

const toWibWeekdayLabel = (dateKey) => {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return '-';
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
    .toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' });
};

const enrichTopItems = async (topItems) => {
  const productIds = topItems.map((i) => i.productId);
  const products   = await prisma.product.findMany({
    where:  { id: { in: productIds } },
    select: { id: true, name: true, sku: true },
  });
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  return topItems.map((item) => ({
    product:      productMap[item.productId] || null,
    totalQty:     item._sum.quantity,
    totalRevenue: item._sum.subtotal,
  }));
};

const escapePdfText = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')
  .replace(/\r?\n/g, ' ');

const buildSimplePdf = (lines = []) => {
  const contentLines = ['BT', '/F1 11 Tf', '50 800 Td'];
  lines.forEach((line, idx) => {
    if (idx > 0) contentLines.push('0 -16 Td');
    contentLines.push(`(${escapePdfText(line)}) Tj`);
  });
  contentLines.push('ET');
  const stream = `${contentLines.join('\n')}\n`;

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream\nendobj\n`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  });
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
  ].join('\n');
  pdf += `${xref}\n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
};

const canViewDashboardReport = requirePermissions(
  'DASHBOARD_OVERVIEW',
  'DASHBOARD_REVENUE_TREND',
  'FINANCE_REPORT_VIEW',
);
const canViewFinanceReport = requirePermissions('FINANCE_REPORT_VIEW');
const canViewShiftReport = requirePermissions('SHIFT_RECAP_VIEW', 'FINANCE_REPORT_VIEW');
const canExportPdf = requirePermissions('FINANCE_EXPORT_PDF');
const getEffectiveBranchId = (req, branchId) => branchId || req.branchId || null;

// ─── GET /reports/daily_sales ─────────────────────────────────
// ?date=YYYY-MM-DD&branch_id=xxx

router.get('/daily_sales', canViewDashboardReport, async (req, res, next) => {
  try {
    const { branch_id, date = toBusinessDateKey() } = req.query;
    const effectiveBranchId = getEffectiveBranchId(req, branch_id);
    const where = buildOrderWhere({ branch_id: effectiveBranchId, date_from: date, date_to: date });

    const [aggregate, paymentBreakdown, topItems] = await prisma.$transaction([
      prisma.order.aggregate({
        where,
        _count: { id: true },
        _sum:   { totalAmount: true, discountAmount: true },
      }),
      prisma.payment.groupBy({
        by:    ['method'],
        where: { status: 'SUCCESS', order: where },
        _count: { id: true },
        _sum:   { amount: true },
      }),
      prisma.orderItem.groupBy({
        by:      ['productId'],
        where:   { order: where },
        _sum:    { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take:    10,
      }),
    ]);

    const breakdown = {};
    for (const p of paymentBreakdown) {
      breakdown[p.method] = Number(p._sum.amount || 0);
    }

    res.json({
      date,
      branchId: effectiveBranchId || 'all',
      summary: {
        totalOrders:   aggregate._count.id || 0,
        totalRevenue:  Number(aggregate._sum.totalAmount  || 0),
        totalDiscount: Number(aggregate._sum.discountAmount || 0),
      },
      paymentBreakdown: breakdown,
      topItems: await enrichTopItems(topItems),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /reports/weekly_sales ────────────────────────────────
// ?branch_id=xxx&days=7 (default 7, max 30)

router.get('/weekly_sales', canViewDashboardReport, async (req, res, next) => {
  try {
    const { branch_id, days = '7' } = req.query;
    const effectiveBranchId = getEffectiveBranchId(req, branch_id);
    const numDays = Math.min(Math.max(parseInt(days) || 7, 1), 30);
    const todayKey = toBusinessDateKey();

    // Bangun array tanggal dari hari ini ke belakang
    const dates = Array.from({ length: numDays }, (_, i) => {
      const delta = -(numDays - 1 - i);
      return shiftBusinessDateKey(todayKey, delta) || todayKey;
    });

    const createdAt = buildBusinessDateRange({
      dateFrom: dates[0],
      dateTo: dates[dates.length - 1],
    });

    const orders = await prisma.order.findMany({
      where: {
        status: { in: REVENUE_STATUSES },
        ...(createdAt && { createdAt }),
        ...(effectiveBranchId && { branchId: effectiveBranchId }),
      },
      select: { createdAt: true, totalAmount: true },
    });

    // Group by date
    const byDate = {};
    for (const date of dates) byDate[date] = { date, revenue: 0, orders: 0 };
    for (const o of orders) {
      const d = toBusinessDateKey(o.createdAt);
      if (byDate[d]) {
        byDate[d].revenue += Number(o.totalAmount);
        byDate[d].orders++;
      }
    }

    const result  = dates.map((d) => ({
      date:    d,
      day:     toWibWeekdayLabel(d),
      revenue: byDate[d].revenue,
      orders:  byDate[d].orders,
    }));

    const totalRevenue = result.reduce((s, r) => s + r.revenue, 0);
    const totalOrders  = result.reduce((s, r) => s + r.orders, 0);

    res.json({
      days: numDays,
      branchId: effectiveBranchId || 'all',
      data: result,
      summary: { totalRevenue, totalOrders },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /reports/shift_summary ───────────────────────────────
// ?shift_id=xxx

router.get('/shift_summary', canViewShiftReport, async (req, res, next) => {
  try {
    const { shift_id } = req.query;
    if (!shift_id) return res.status(422).json({ error: 'shift_id required' });
    const result = await getShiftSummaryService(shift_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /reports/monthly ─────────────────────────────────────
// ?year=2025&month=1&branch_id=xxx

router.get('/monthly', canViewDashboardReport, async (req, res, next) => {
  try {
    const nowKey = toBusinessDateKey();
    const [defaultYear, defaultMonth] = nowKey.split('-').map(Number);
    const {
      branch_id,
      year  = defaultYear,
      month = defaultMonth,
    } = req.query;
    const effectiveBranchId = getEffectiveBranchId(req, branch_id);

    const normalizedYear = Number(year) || defaultYear;
    const normalizedMonth = Math.min(Math.max(Number(month) || defaultMonth, 1), 12);
    const monthStr = String(normalizedMonth).padStart(2, '0');
    const daysInMonth = new Date(Date.UTC(normalizedYear, normalizedMonth, 0)).getUTCDate();
    const firstDateKey = `${normalizedYear}-${monthStr}-01`;
    const lastDateKey = `${normalizedYear}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
    const createdAt = buildBusinessDateRange({
      dateFrom: firstDateKey,
      dateTo: lastDateKey,
    });

    const where = {
      status: { in: REVENUE_STATUSES },
      ...(createdAt && { createdAt }),
      ...(effectiveBranchId && { branchId: effectiveBranchId }),
    };

    const [aggregate, topItems] = await Promise.all([
      prisma.order.aggregate({
        where,
        _count: { id: true },
        _sum:   { totalAmount: true, discountAmount: true },
      }),
      prisma.orderItem.groupBy({
        by:      ['productId'],
        where:   { order: where },
        _sum:    { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take:    10,
      }),
    ]);

    res.json({
      year: normalizedYear,
      month: normalizedMonth,
      branchId: effectiveBranchId || 'all',
      summary: {
        totalOrders:   aggregate._count.id || 0,
        totalRevenue:  Number(aggregate._sum.totalAmount  || 0),
        totalDiscount: Number(aggregate._sum.discountAmount || 0),
      },
      topItems: await enrichTopItems(topItems),
    });
  } catch (err) {
    next(err);
  }
});

// --- GET /reports/sales_breakdown
// ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&branch_id=xxx
router.get('/sales_breakdown', canViewFinanceReport, async (req, res, next) => {
  try {
    const { date_from, date_to, branch_id } = req.query;
    const effectiveBranchId = getEffectiveBranchId(req, branch_id);
    const where = buildOrderWhere({ branch_id: effectiveBranchId, date_from, date_to });

    const orders = await prisma.order.findMany({
      where,
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: {
              include: {
                category: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const byCashierMap = new Map();
    const byTableMap = new Map();
    const byCategoryMap = new Map();

    for (const order of orders) {
      const totalAmount = Number(order.totalAmount || 0);
      const discount = Number(order.discountAmount || 0);
      const cashierId = order.cashierId || 'unknown';
      const cashierEntry = byCashierMap.get(cashierId) || {
        cashier: order.cashier || null,
        totalOrders: 0,
        totalRevenue: 0,
        totalDiscount: 0,
      };
      cashierEntry.totalOrders += 1;
      cashierEntry.totalRevenue += totalAmount;
      cashierEntry.totalDiscount += discount;
      byCashierMap.set(cashierId, cashierEntry);

      const tableKey = order.tableNumber || 'NO_TABLE';
      const tableEntry = byTableMap.get(tableKey) || {
        tableNumber: tableKey === 'NO_TABLE' ? null : tableKey,
        totalOrders: 0,
        totalRevenue: 0,
      };
      tableEntry.totalOrders += 1;
      tableEntry.totalRevenue += totalAmount;
      byTableMap.set(tableKey, tableEntry);

      for (const item of order.items || []) {
        const categoryId = item.product?.category?.id || 'UNCATEGORIZED';
        const categoryName = item.product?.category?.name || 'Tanpa Kategori';
        const categoryEntry = byCategoryMap.get(categoryId) || {
          category: { id: categoryId, name: categoryName },
          totalQty: 0,
          totalRevenue: 0,
        };
        categoryEntry.totalQty += Number(item.quantity || 0);
        categoryEntry.totalRevenue += Number(item.subtotal || 0);
        byCategoryMap.set(categoryId, categoryEntry);
      }
    }

    res.json({
      period: { dateFrom: date_from || null, dateTo: date_to || null },
      branchId: effectiveBranchId || 'all',
      byCashier: [...byCashierMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
      byTable: [...byTableMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
      byCategory: [...byCategoryMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
      summary: {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0),
        totalDiscount: orders.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// --- GET /reports/gross_profit
// Revenue - HPP (hpp_amount)
router.get('/gross_profit', canViewFinanceReport, async (req, res, next) => {
  try {
    const { date_from, date_to, branch_id } = req.query;
    const effectiveBranchId = getEffectiveBranchId(req, branch_id);
    const where = buildOrderWhere({ branch_id: effectiveBranchId, date_from, date_to });

    const aggregate = await prisma.order.aggregate({
      where,
      _sum: {
        totalAmount: true,
        hppAmount: true,
      },
      _count: { id: true },
    });

    const revenue = Number(aggregate._sum.totalAmount || 0);
    const hpp = Number(aggregate._sum.hppAmount || 0);
    const grossProfit = revenue - hpp;

    res.json({
      period: { dateFrom: date_from || null, dateTo: date_to || null },
      branchId: effectiveBranchId || 'all',
      totalOrders: aggregate._count.id || 0,
      revenue,
      hpp,
      grossProfit,
      grossMarginPct: revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(2)) : 0,
    });
  } catch (err) {
    next(err);
  }
});

// --- GET /reports/tax_service
router.get('/tax_service', canViewFinanceReport, async (req, res, next) => {
  try {
    const { date_from, date_to, branch_id } = req.query;
    const effectiveBranchId = getEffectiveBranchId(req, branch_id);
    const where = buildOrderWhere({ branch_id: effectiveBranchId, date_from, date_to });

    const aggregate = await prisma.order.aggregate({
      where,
      _sum: {
        totalAmount: true,
        taxAmount: true,
        serviceCharge: true,
      },
      _count: { id: true },
    });

    res.json({
      period: { dateFrom: date_from || null, dateTo: date_to || null },
      branchId: effectiveBranchId || 'all',
      totalOrders: aggregate._count.id || 0,
      grossSales: Number(aggregate._sum.totalAmount || 0),
      totalTax: Number(aggregate._sum.taxAmount || 0),
      totalServiceCharge: Number(aggregate._sum.serviceCharge || 0),
    });
  } catch (err) {
    next(err);
  }
});

// --- GET /reports/void_discount
router.get('/void_discount', canViewFinanceReport, async (req, res, next) => {
  try {
    const { date_from, date_to, branch_id } = req.query;
    const effectiveBranchId = getEffectiveBranchId(req, branch_id);

    const paidWhere = buildOrderWhere({ branch_id: effectiveBranchId, date_from, date_to });
    const cancelledDateRange = buildBusinessDateRange({ dateFrom: date_from, dateTo: date_to });
    const cancelledWhere = {
      status: { in: ['VOID', 'CANCELLED'] },
      ...(cancelledDateRange && { createdAt: cancelledDateRange }),
      ...(effectiveBranchId && { branchId: effectiveBranchId }),
    };

    const [paidAggregate, voidOrders] = await Promise.all([
      prisma.order.aggregate({
        where: paidWhere,
        _sum: { discountAmount: true },
        _count: { id: true },
      }),
      prisma.order.findMany({
        where: cancelledWhere,
        select: {
          id: true,
          status: true,
          cancelReason: true,
          createdAt: true,
          totalAmount: true,
          discountAmount: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      period: { dateFrom: date_from || null, dateTo: date_to || null },
      branchId: effectiveBranchId || 'all',
      totalDiscountOnPaidOrders: Number(paidAggregate._sum.discountAmount || 0),
      totalPaidOrders: paidAggregate._count.id || 0,
      totalVoidOrCancelledOrders: voidOrders.length,
      voidOrCancelledAmount: voidOrders.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0),
      rows: voidOrders.map((row) => ({
        id: row.id,
        status: row.status,
        cancel_reason: row.cancelReason || null,
        created_at: row.createdAt?.toISOString(),
        total_amount: Number(row.totalAmount || 0),
        discount_amount: Number(row.discountAmount || 0),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// --- GET /reports/shift_recap
router.get('/shift_recap', canViewShiftReport, async (req, res, next) => {
  try {
    const { date_from, date_to, branch_id } = req.query;
    const effectiveBranchId = getEffectiveBranchId(req, branch_id);
    const shiftDateRange = buildBusinessDateRange({ dateFrom: date_from, dateTo: date_to });
    const where = {
      ...(shiftDateRange && { openedAt: shiftDateRange }),
      ...(effectiveBranchId && { branchId: effectiveBranchId }),
    };

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, role: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { openedAt: 'desc' },
    });

    res.json({
      period: { dateFrom: date_from || null, dateTo: date_to || null },
      branchId: effectiveBranchId || 'all',
      totalShifts: shifts.length,
      rows: shifts.map((shift) => ({
        id: shift.id,
        status: shift.status,
        opened_at: shift.openedAt?.toISOString(),
        closed_at: shift.closedAt?.toISOString() || null,
        opening_cash: Number(shift.openingCash || 0),
        closing_cash: shift.closingCash != null ? Number(shift.closingCash) : null,
        order_count: shift._count?.orders || 0,
        user: shift.user,
        branch: shift.branch,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// --- GET /reports/export_pdf
// Returns binary PDF by default, or JSON payload when `format=json`.
router.get('/export_pdf', canExportPdf, async (req, res, next) => {
  try {
    const {
      report = 'daily_sales',
      branch_id,
      date_from,
      date_to,
      format = 'pdf',
    } = req.query;
    const effectiveBranchId = getEffectiveBranchId(req, branch_id);
    const generatedAt = new Date().toISOString();

    const where = buildOrderWhere({ branch_id: effectiveBranchId, date_from, date_to });
    const aggregate = await prisma.order.aggregate({
      where,
      _count: { id: true },
      _sum: { totalAmount: true, discountAmount: true, taxAmount: true, serviceCharge: true },
    });

    const payload = {
      report,
      generatedAt,
      branchId: effectiveBranchId || 'all',
      period: { dateFrom: date_from || null, dateTo: date_to || null },
      summary: {
        totalOrders: aggregate._count.id || 0,
        totalRevenue: Number(aggregate._sum.totalAmount || 0),
        totalDiscount: Number(aggregate._sum.discountAmount || 0),
        totalTax: Number(aggregate._sum.taxAmount || 0),
        totalServiceCharge: Number(aggregate._sum.serviceCharge || 0),
      },
      exportFormat: 'PDF_BINARY',
    };

    if (String(format).toLowerCase() === 'json') {
      return res.json(payload);
    }

    const lines = [
      'Laporan POS',
      `Report: ${payload.report}`,
      `Generated At: ${payload.generatedAt}`,
      `Branch: ${payload.branchId}`,
      `Period: ${payload.period.dateFrom || '-'} s/d ${payload.period.dateTo || '-'}`,
      '',
      `Total Orders: ${payload.summary.totalOrders}`,
      `Total Revenue: ${payload.summary.totalRevenue}`,
      `Total Discount: ${payload.summary.totalDiscount}`,
      `Total Tax: ${payload.summary.totalTax}`,
      `Total Service Charge: ${payload.summary.totalServiceCharge}`,
    ];

    const pdfBuffer = buildSimplePdf(lines);
    const filenameDate = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${filenameDate}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
