const { PrismaClient } = require('../generated/client-node');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const IDS = {
  branchMain: 'a28160db-68f9-4180-8f3b-2a4d8707b724',
};

const DEFAULT_BRANCH = {
  id: IDS.branchMain,
  name: 'Cabang Utama',
  address: 'Jl. Sudirman No. 1, Jakarta',
  phone: '021-12345678',
  isActive: true,
};

const MANAGER_PERMISSIONS = [
  'DASHBOARD_OVERVIEW',
  'DASHBOARD_REVENUE_TREND',
  'DASHBOARD_TOP_PRODUCTS',
  'DASHBOARD_OCCUPANCY',
  'DASHBOARD_ACTIVE_ORDERS',
  'MENU_CATEGORY_MANAGE',
  'MENU_ITEM_MANAGE',
  'MENU_VARIANT_MANAGE',
  'MENU_MODIFIER_MANAGE',
  'MENU_BUNDLE_MANAGE',
  'ORDER_MONITOR',
  'ORDER_HISTORY_VIEW',
  'ORDER_CANCEL',
  'INVENTORY_MASTER_MANAGE',
  'INVENTORY_PURCHASE_MANAGE',
  'INVENTORY_STOCK_OPNAME',
  'INVENTORY_REPORT_VIEW',
  'FINANCE_REPORT_VIEW',
  'SHIFT_RECAP_VIEW',
  'EMPLOYEE_SHIFT_MANAGE',
  'AUDIT_LOG_VIEW',
  'PROMO_MANAGE',
];

const CASHIER_PERMISSIONS = [
  'ORDER_MONITOR',
  'ORDER_HISTORY_VIEW',
  'ORDER_CANCEL',
];

const WAITER_PERMISSIONS = [
  'ORDER_MONITOR',
  'ORDER_HISTORY_VIEW',
];

const KITCHEN_PERMISSIONS = [
  'ORDER_MONITOR',
];

const DEFAULT_USERS = [
  {
    email: 'owner@pos.com',
    password: 'owner123',
    name: 'Owner',
    role: 'SUPER_ADMIN',
    branchId: null,
  },
  {
    email: 'manager@pos.com',
    password: 'manager123',
    name: 'Manager Operasional',
    role: 'MANAGER',
    branchId: IDS.branchMain,
  },
  {
    email: 'kasir@pos.com',
    password: 'kasir123',
    name: 'Kasir Satu',
    role: 'CASHIER',
    branchId: IDS.branchMain,
  },
  {
    email: 'waiter@pos.com',
    password: 'waiter123',
    name: 'Waiter Satu',
    role: 'WAITER',
    branchId: IDS.branchMain,
  },
  {
    email: 'kitchen@pos.com',
    password: 'kitchen123',
    name: 'Kitchen Satu',
    role: 'KITCHEN',
    branchId: IDS.branchMain,
  },
];

const ROLE_PERMISSION_SEED = [
  { role: 'MANAGER', permissions: MANAGER_PERMISSIONS },
  { role: 'CASHIER', permissions: CASHIER_PERMISSIONS },
  { role: 'WAITER', permissions: WAITER_PERMISSIONS },
  { role: 'KITCHEN', permissions: KITCHEN_PERMISSIONS },
];

const TABLES_TO_TRUNCATE = [
  'refunds',
  'payment_events',
  'payment_attempts',
  'payments',
  'order_status_histories',
  'order_cancellation_logs',
  'order_items',
  'orders',
  'cash_movements',
  'shifts',
  'shift_schedules',
  'dining_tables',
  'stock_opname_items',
  'stock_opnames',
  'purchase_order_items',
  'purchase_orders',
  'ingredient_movements',
  'ingredient_stocks',
  'recipe_items',
  'ingredients',
  'units',
  'stock_movements',
  'inventories',
  'variant_prices',
  'product_variants',
  'prices',
  'product_modifier_groups',
  'modifier_options',
  'modifier_groups',
  'bundle_items',
  'bundles',
  'promotion_targets',
  'promotions',
  'products',
  'categories',
  'suppliers',
  'backup_logs',
  'printer_settings',
  'invoice_settings',
  'payment_method_settings',
  'business_profiles',
  'audit_logs',
  'role_permissions',
  'users',
  'branches',
];

const ensureSafeEnvironment = () => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error('Seed ini destruktif. Set ALLOW_DESTRUCTIVE_SEED=true jika memang ingin dijalankan di production.');
  }
};

const truncateApplicationTables = async () => {
  const quotedTables = TABLES_TO_TRUNCATE.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE;`);
};

const createUsers = async () => {
  const userRows = [];

  for (const user of DEFAULT_USERS) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    userRows.push({
      email: user.email,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      passwordHash,
      isActive: true,
    });
  }

  await prisma.user.createMany({ data: userRows });
};

const createRolePermissions = async () => {
  const rows = ROLE_PERMISSION_SEED.flatMap((entry) =>
    entry.permissions.map((permission) => ({
      role: entry.role,
      permission,
    }))
  );

  if (!rows.length) return;
  await prisma.rolePermission.createMany({ data: rows });
};

async function main() {
  ensureSafeEnvironment();

  console.log('Seeding database accounts only...');
  await truncateApplicationTables();
  console.log(`OK Rows cleaned: ${TABLES_TO_TRUNCATE.length} tables truncated`);

  const branch = await prisma.branch.create({ data: DEFAULT_BRANCH });
  console.log(`OK Branch: ${branch.name}`);

  await createUsers();
  console.log(`OK Users: ${DEFAULT_USERS.map((user) => user.email).join(', ')}`);

  await createRolePermissions();
  console.log(
    `OK Role permissions: ${ROLE_PERMISSION_SEED.map((entry) => `${entry.role}=${entry.permissions.length}`).join(', ')}`
  );

  console.log('====================================================');
  console.log('Seed selesai. Data contoh lain tidak dibuat.');
  console.log('Owner   : owner@pos.com / owner123');
  console.log('Manager : manager@pos.com / manager123');
  console.log('Kasir   : kasir@pos.com / kasir123');
  console.log('Waiter  : waiter@pos.com / waiter123');
  console.log('Kitchen : kitchen@pos.com / kitchen123');
  console.log('====================================================');
}

main()
  .catch((error) => {
    console.error('Seed gagal:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
