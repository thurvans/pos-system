const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const { resolveDataPath } = require('../../config/runtimePaths');
const { authenticate, authorize, requireBranchAccess } = require('../../middleware/auth');
const { requirePermissions } = require('../../middleware/featurePermission');
const { AppError } = require('../../utils/errors');

const router = express.Router();
const SUPPORTED_PAYMENT_METHODS = ['CASH', 'QRIS', 'CARD'];
const isSupportedPaymentMethod = (value) => SUPPORTED_PAYMENT_METHODS.includes(String(value || '').toUpperCase());
const filterSupportedPaymentMethods = (rows) =>
  (rows || []).filter((row) => isSupportedPaymentMethod(row.method));

const resolveRuntimeBranchId = (req, branchId) => {
  const requestedBranchId = branchId || null;

  if (req.user.role === 'SUPER_ADMIN') {
    if (requestedBranchId) return requestedBranchId;
    if (req.user.branchId) return req.user.branchId;
    throw new AppError('branch_id wajib untuk super admin', 422);
  }

  if (!req.user.branchId) {
    throw new AppError('User harus terikat cabang', 422);
  }

  if (requestedBranchId && requestedBranchId !== req.user.branchId) {
    throw new AppError('Forbidden: hanya bisa akses cabang sendiri', 403);
  }

  return req.user.branchId;
};

const toNumericOrZero = (value) => Number(value || 0);

router.get('/pos-runtime', authenticate, requireBranchAccess(), async (req, res, next) => {
  try {
    const branchId = resolveRuntimeBranchId(
      req,
      req.query.branch_id || req.query.branchId || req.branchId || null
    );

    const [branchProfile, globalProfile, invoice, branchMethods, globalMethods] = await Promise.all([
      prisma.businessProfile.findFirst({
        where: { branchId },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.businessProfile.findFirst({
        where: { branchId: null },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.invoiceSetting.findUnique({
        where: { branchId },
      }),
      prisma.paymentMethodSetting.findMany({
        where: { branchId },
        orderBy: { method: 'asc' },
      }),
      prisma.paymentMethodSetting.findMany({
        where: { branchId: null },
        orderBy: { method: 'asc' },
      }),
    ]);

    const profile = branchProfile || globalProfile || null;
    const paymentMethodMap = new Map();
    for (const row of globalMethods) paymentMethodMap.set(row.method, row);
    for (const row of branchMethods) paymentMethodMap.set(row.method, row);
    const paymentMethods = filterSupportedPaymentMethods([...paymentMethodMap.values()])
      .sort((a, b) => a.method.localeCompare(b.method));

    res.json({
      branchId,
      businessProfile: profile
        ? {
          id: profile.id,
          name: profile.name,
          logoUrl: profile.logoUrl,
          address: profile.address,
          phone: profile.phone,
          email: profile.email,
          taxNumber: profile.taxNumber,
          taxRate: toNumericOrZero(profile.taxRate),
          serviceChargeRate: toNumericOrZero(profile.serviceChargeRate),
          currency: profile.currency || 'IDR',
        }
        : null,
      invoice: invoice
        ? {
          headerText: invoice.headerText,
          footerText: invoice.footerText,
          showLogo: invoice.showLogo,
          showTaxBreakdown: invoice.showTaxBreakdown,
          prefix: invoice.prefix,
        }
        : null,
      paymentMethods: paymentMethods.map((row) => ({
        method: row.method,
        isActive: row.isActive,
        configuration: row.configuration || null,
      })),
      activePaymentMethods: paymentMethods.filter((row) => row.isActive).map((row) => row.method),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.use(
  authenticate,
  authorize('MANAGER', 'SUPER_ADMIN'),
  requirePermissions('SYSTEM_SETTINGS_MANAGE'),
);

const parseId = z.string().uuid('ID tidak valid');

const resolveBranchId = (req, branchId) => {
  if (req.user.role === 'SUPER_ADMIN') return branchId || null;
  if (!req.user.branchId) throw new AppError('Manager harus terikat cabang', 422);
  if (branchId && branchId !== req.user.branchId) {
    throw new AppError('Forbidden: hanya bisa akses cabang sendiri', 403);
  }
  return req.user.branchId;
};

const serializeBackupLog = (row) => ({
  ...row,
  sizeBytes: row.sizeBytes != null ? Number(row.sizeBytes) : null,
  startedAt: row.startedAt?.toISOString?.() || row.startedAt,
  completedAt: row.completedAt?.toISOString?.() || row.completedAt || null,
});

const backupDir = resolveDataPath('backups');
const toPublicBackupPath = (filename) => `/api/settings/backups/${filename}`;
const toDiskBackupPath = (source) => {
  const normalized = String(source || '').replace(/\\/g, '/');
  const filename = path.basename(normalized);
  if (!filename || !filename.toLowerCase().endsWith('.json')) {
    throw new AppError('File backup harus .json', 422);
  }
  return path.join(backupDir, filename);
};

const buildScopeBranchWhere = (branchId) => (branchId ? { branchId } : {});

const ensureBackupFilename = (filename) => {
  if (!/^[a-zA-Z0-9._-]+\.json$/.test(filename || '')) {
    throw new AppError('Nama file backup tidak valid', 422);
  }
  return filename;
};

router.get('/overview', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, req.query.branch_id);
    const whereBranch = branchId ? { branchId } : {};
    const backupLogWhere = req.user.role === 'SUPER_ADMIN'
      ? {}
      : { triggeredBy: req.user.id };

    const [businessProfile, paymentMethods, printers, invoice, latestBackups] = await Promise.all([
      prisma.businessProfile.findFirst({
        where: whereBranch,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.paymentMethodSetting.findMany({
        where: whereBranch,
        orderBy: { method: 'asc' },
      }),
      prisma.printerSetting.findMany({
        where: whereBranch,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoiceSetting.findFirst({
        where: whereBranch,
      }),
      prisma.backupLog.findMany({
        where: backupLogWhere,
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      branchId: branchId || 'global',
      businessProfile,
      paymentMethods: filterSupportedPaymentMethods(paymentMethods),
      printers,
      invoice,
      backupLogs: latestBackups.map(serializeBackupLog),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/business-profile', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, req.query.branch_id);
    const profile = await prisma.businessProfile.findFirst({
      where: branchId ? { branchId } : {},
      orderBy: { updatedAt: 'desc' },
    });
    res.json(profile || null);
  } catch (err) {
    next(err);
  }
});

router.put('/business-profile', async (req, res, next) => {
  try {
    const body = z.object({
      branchId: parseId.optional(),
      name: z.string().min(1).optional(),
      logoUrl: z.string().url().nullable().optional(),
      address: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().email().nullable().optional(),
      taxNumber: z.string().nullable().optional(),
      taxRate: z.number().min(0).max(100).optional(),
      serviceChargeRate: z.number().min(0).max(100).optional(),
      currency: z.string().min(1).optional(),
    }).parse(req.body);

    const branchId = resolveBranchId(req, body.branchId);
    const existing = await prisma.businessProfile.findFirst({
      where: branchId ? { branchId } : { branchId: null },
      orderBy: { createdAt: 'asc' },
    });

    const payload = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.taxNumber !== undefined && { taxNumber: body.taxNumber }),
      ...(body.taxRate !== undefined && { taxRate: body.taxRate }),
      ...(body.serviceChargeRate !== undefined && { serviceChargeRate: body.serviceChargeRate }),
      ...(body.currency !== undefined && { currency: body.currency }),
      ...(branchId !== undefined && { branchId }),
    };

    if (existing) {
      const updated = await prisma.businessProfile.update({
        where: { id: existing.id },
        data: payload,
      });
      return res.json(updated);
    }

    const created = await prisma.businessProfile.create({
      data: {
        name: payload.name || 'Business Profile',
        branchId: branchId || null,
        ...payload,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.get('/payment-methods', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, req.query.branch_id);
    const methods = await prisma.paymentMethodSetting.findMany({
      where: branchId ? { branchId } : {},
      orderBy: { method: 'asc' },
    });
    res.json(filterSupportedPaymentMethods(methods));
  } catch (err) {
    next(err);
  }
});

router.put('/payment-methods', async (req, res, next) => {
  try {
    const body = z.object({
      branchId: parseId.optional(),
      methods: z.array(z.object({
        method: z.enum(['CASH', 'QRIS', 'CARD']),
        isActive: z.boolean(),
        configuration: z.any().optional(),
      })).min(1),
    }).parse(req.body);

    const branchId = resolveBranchId(req, body.branchId);

    const updated = await prisma.$transaction(async (tx) => {
      const list = [];
      for (const item of body.methods) {
        const row = await tx.paymentMethodSetting.upsert({
          where: {
            branchId_method: {
              branchId: branchId || null,
              method: item.method,
            },
          },
          update: {
            isActive: item.isActive,
            configuration: item.configuration || null,
          },
          create: {
            branchId: branchId || null,
            method: item.method,
            isActive: item.isActive,
            configuration: item.configuration || null,
          },
        });
        list.push(row);
      }
      return list;
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/printers', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, req.query.branch_id);
    const printers = await prisma.printerSetting.findMany({
      where: branchId ? { branchId } : {},
      orderBy: { createdAt: 'desc' },
    });
    res.json(printers);
  } catch (err) {
    next(err);
  }
});

router.post('/printers', async (req, res, next) => {
  try {
    const body = z.object({
      branchId: parseId.optional(),
      name: z.string().min(1),
      printerType: z.string().min(1),
      connectionInfo: z.any(),
      isActive: z.boolean().optional(),
    }).parse(req.body);
    const branchId = resolveBranchId(req, body.branchId);

    if (!branchId) throw new AppError('branchId wajib untuk printer', 422);

    const printer = await prisma.printerSetting.create({
      data: {
        branchId,
        name: body.name,
        printerType: body.printerType,
        connectionInfo: body.connectionInfo,
        isActive: body.isActive ?? true,
      },
    });
    res.status(201).json(printer);
  } catch (err) {
    next(err);
  }
});

router.put('/printers/:id', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1).optional(),
      printerType: z.string().min(1).optional(),
      connectionInfo: z.any().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const existing = await prisma.printerSetting.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Printer tidak ditemukan', 404);
    resolveBranchId(req, existing.branchId);

    const printer = await prisma.printerSetting.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json(printer);
  } catch (err) {
    next(err);
  }
});

router.get('/invoice', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, req.query.branch_id);
    if (!branchId) throw new AppError('branch_id wajib', 422);
    const invoice = await prisma.invoiceSetting.findUnique({ where: { branchId } });
    res.json(invoice || null);
  } catch (err) {
    next(err);
  }
});

router.put('/invoice', async (req, res, next) => {
  try {
    const body = z.object({
      branchId: parseId.optional(),
      headerText: z.string().nullable().optional(),
      footerText: z.string().nullable().optional(),
      showLogo: z.boolean().optional(),
      showTaxBreakdown: z.boolean().optional(),
      prefix: z.string().nullable().optional(),
    }).parse(req.body);
    const branchId = resolveBranchId(req, body.branchId);
    if (!branchId) throw new AppError('branchId wajib', 422);

    const invoice = await prisma.invoiceSetting.upsert({
      where: { branchId },
      update: {
        ...(body.headerText !== undefined && { headerText: body.headerText }),
        ...(body.footerText !== undefined && { footerText: body.footerText }),
        ...(body.showLogo !== undefined && { showLogo: body.showLogo }),
        ...(body.showTaxBreakdown !== undefined && { showTaxBreakdown: body.showTaxBreakdown }),
        ...(body.prefix !== undefined && { prefix: body.prefix }),
      },
      create: {
        branchId,
        headerText: body.headerText || null,
        footerText: body.footerText || null,
        showLogo: body.showLogo ?? true,
        showTaxBreakdown: body.showTaxBreakdown ?? true,
        prefix: body.prefix || null,
      },
    });
    res.json(invoice);
  } catch (err) {
    next(err);
  }
});

router.get('/backup-logs', requirePermissions('SYSTEM_BACKUP_MANAGE'), async (req, res, next) => {
  try {
    const where = req.user.role === 'SUPER_ADMIN'
      ? {}
      : { triggeredBy: req.user.id };
    const logs = await prisma.backupLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: Number(req.query.limit || 50),
    });
    res.json(logs.map(serializeBackupLog));
  } catch (err) {
    next(err);
  }
});

router.get('/backups/:filename', requirePermissions('SYSTEM_BACKUP_MANAGE'), async (req, res, next) => {
  try {
    const filename = ensureBackupFilename(req.params.filename);
    const sourcePath = toPublicBackupPath(filename);
    const legacySourcePath = `/backups/${filename}`;

    if (req.user.role !== 'SUPER_ADMIN') {
      const canAccess = await prisma.backupLog.findFirst({
        where: {
          triggeredBy: req.user.id,
          filePath: { in: [sourcePath, legacySourcePath] },
        },
        select: { id: true },
      });
      if (!canAccess) {
        throw new AppError('Forbidden: backup tidak ditemukan', 403);
      }
    }

    const diskPath = path.join(backupDir, filename);
    let fileBuffer;
    try {
      fileBuffer = await fs.readFile(diskPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new AppError('File backup tidak ditemukan', 404);
      }
      throw err;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(fileBuffer);
  } catch (err) {
    return next(err);
  }
});

router.post('/backup', requirePermissions('SYSTEM_BACKUP_MANAGE'), async (req, res, next) => {
  try {
    const body = z.object({
      branchId: parseId.optional(),
    }).optional().parse(req.body || {});
    const branchId = resolveBranchId(req, body?.branchId || req.query.branch_id);
    const whereBranch = buildScopeBranchWhere(branchId);

    const started = await prisma.backupLog.create({
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        triggeredBy: req.user.id,
      },
    });

    try {
      await fs.mkdir(backupDir, { recursive: true });
      const [businessProfiles, paymentMethods, printers, invoices] = await Promise.all([
        prisma.businessProfile.findMany({
          where: whereBranch,
          select: {
            id: true,
            name: true,
            logoUrl: true,
            address: true,
            phone: true,
            email: true,
            taxNumber: true,
            taxRate: true,
            serviceChargeRate: true,
            currency: true,
            branchId: true,
          },
        }),
        prisma.paymentMethodSetting.findMany({
          where: whereBranch,
          select: {
            branchId: true,
            method: true,
            isActive: true,
            configuration: true,
          },
        }),
        prisma.printerSetting.findMany({
          where: whereBranch,
          select: {
            id: true,
            branchId: true,
            name: true,
            printerType: true,
            connectionInfo: true,
            isActive: true,
          },
        }),
        prisma.invoiceSetting.findMany({
          where: whereBranch,
          select: {
            branchId: true,
            headerText: true,
            footerText: true,
            showLogo: true,
            showTaxBreakdown: true,
            prefix: true,
          },
        }),
      ]);

      const payload = {
        version: 1,
        createdAt: new Date().toISOString(),
        scope: {
          branchId: branchId || null,
          requestedBy: req.user.id,
        },
        data: {
          businessProfiles,
          paymentMethods: filterSupportedPaymentMethods(paymentMethods),
          printers,
          invoices,
        },
      };

      const filename = `backup-${started.id}.json`;
      const diskPath = path.join(backupDir, filename);
      await fs.writeFile(diskPath, JSON.stringify(payload, null, 2), 'utf8');
      const stat = await fs.stat(diskPath);

      const completed = await prisma.backupLog.update({
        where: { id: started.id },
        data: {
          status: 'SUCCESS',
          filePath: toPublicBackupPath(filename),
          sizeBytes: BigInt(stat.size),
          completedAt: new Date(),
        },
      });

      return res.status(201).json(serializeBackupLog(completed));
    } catch (innerErr) {
      await prisma.backupLog.update({
        where: { id: started.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });
      throw innerErr;
    }
  } catch (err) {
    next(err);
  }
});

router.post('/restore', requirePermissions('SYSTEM_BACKUP_MANAGE'), async (req, res, next) => {
  try {
    const body = z.object({
      source: z.string().min(1),
      branchId: parseId.optional(),
    }).parse(req.body);
    const branchId = resolveBranchId(req, body.branchId || req.query.branch_id);
    const diskPath = toDiskBackupPath(body.source);
    const raw = await fs.readFile(diskPath, 'utf8');
    const parsed = JSON.parse(raw);
    const backupData = parsed?.data || {};

    const shouldRestoreBranch = (rowBranchId) => {
      const normalized = rowBranchId || null;
      if (!branchId && req.user.role === 'SUPER_ADMIN') {
        return true;
      }
      return normalized === (branchId || null);
    };

    const restored = await prisma.$transaction(async (tx) => {
      let businessProfileCount = 0;
      let paymentMethodCount = 0;
      let printerCount = 0;
      let invoiceCount = 0;

      for (const row of backupData.businessProfiles || []) {
        if (!shouldRestoreBranch(row.branchId)) continue;
        await tx.businessProfile.upsert({
          where: { id: row.id },
          update: {
            name: row.name,
            logoUrl: row.logoUrl || null,
            address: row.address || null,
            phone: row.phone || null,
            email: row.email || null,
            taxNumber: row.taxNumber || null,
            taxRate: row.taxRate ?? 0,
            serviceChargeRate: row.serviceChargeRate ?? 0,
            currency: row.currency || 'IDR',
            branchId: row.branchId || null,
          },
          create: {
            id: row.id,
            name: row.name,
            logoUrl: row.logoUrl || null,
            address: row.address || null,
            phone: row.phone || null,
            email: row.email || null,
            taxNumber: row.taxNumber || null,
            taxRate: row.taxRate ?? 0,
            serviceChargeRate: row.serviceChargeRate ?? 0,
            currency: row.currency || 'IDR',
            branchId: row.branchId || null,
          },
        });
        businessProfileCount += 1;
      }

      for (const row of backupData.paymentMethods || []) {
        if (!shouldRestoreBranch(row.branchId)) continue;
        if (!isSupportedPaymentMethod(row.method)) continue;
        await tx.paymentMethodSetting.upsert({
          where: {
            branchId_method: {
              branchId: row.branchId || null,
              method: row.method,
            },
          },
          update: {
            isActive: Boolean(row.isActive),
            configuration: row.configuration || null,
          },
          create: {
            branchId: row.branchId || null,
            method: row.method,
            isActive: Boolean(row.isActive),
            configuration: row.configuration || null,
          },
        });
        paymentMethodCount += 1;
      }

      for (const row of backupData.printers || []) {
        if (!row.branchId || !shouldRestoreBranch(row.branchId)) continue;
        await tx.printerSetting.upsert({
          where: { id: row.id },
          update: {
            branchId: row.branchId,
            name: row.name,
            printerType: row.printerType,
            connectionInfo: row.connectionInfo || {},
            isActive: Boolean(row.isActive),
          },
          create: {
            id: row.id,
            branchId: row.branchId,
            name: row.name,
            printerType: row.printerType,
            connectionInfo: row.connectionInfo || {},
            isActive: Boolean(row.isActive),
          },
        });
        printerCount += 1;
      }

      for (const row of backupData.invoices || []) {
        if (!row.branchId || !shouldRestoreBranch(row.branchId)) continue;
        await tx.invoiceSetting.upsert({
          where: { branchId: row.branchId },
          update: {
            headerText: row.headerText || null,
            footerText: row.footerText || null,
            showLogo: row.showLogo ?? true,
            showTaxBreakdown: row.showTaxBreakdown ?? true,
            prefix: row.prefix || null,
          },
          create: {
            branchId: row.branchId,
            headerText: row.headerText || null,
            footerText: row.footerText || null,
            showLogo: row.showLogo ?? true,
            showTaxBreakdown: row.showTaxBreakdown ?? true,
            prefix: row.prefix || null,
          },
        });
        invoiceCount += 1;
      }

      const log = await tx.backupLog.create({
        data: {
          status: 'RESTORE_SUCCESS',
          filePath: body.source,
          startedAt: new Date(),
          completedAt: new Date(),
          triggeredBy: req.user.id,
        },
      });

      return {
        log,
        counts: {
          businessProfiles: businessProfileCount,
          paymentMethods: paymentMethodCount,
          printers: printerCount,
          invoices: invoiceCount,
        },
      };
    });

    res.status(201).json({
      ...serializeBackupLog(restored.log),
      restored_counts: restored.counts,
      message: 'Restore selesai diproses.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
