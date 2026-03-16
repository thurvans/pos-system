const { PrismaClient, Role, FeaturePermission } = require('../generated/client-node');

const prisma = new PrismaClient();

const REQUIRED_ROLE_MATRIX = {
  MANAGER: [
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
  ],
  CASHIER: [
    'ORDER_MONITOR',
    'ORDER_HISTORY_VIEW',
    'ORDER_CANCEL',
  ],
  WAITER: [
    'ORDER_MONITOR',
    'ORDER_HISTORY_VIEW',
  ],
  KITCHEN: [
    'ORDER_MONITOR',
  ],
};

const MANAGER_FORBIDDEN = new Set([
  'FINANCE_EXPORT_PDF',
  'EMPLOYEE_MANAGE',
  'SYSTEM_SETTINGS_MANAGE',
  'SYSTEM_BACKUP_MANAGE',
]);

const EXPECTED_ROLES = new Set(Object.values(Role));
const KNOWN_PERMISSIONS = new Set(Object.values(FeaturePermission));

const hasFlag = (flag) => process.argv.includes(flag);

const summarizeList = (title, values) => {
  const list = [...values];
  if (!list.length) return;
  console.log(`- ${title}: ${list.join(', ')}`);
};

const normalizeRowsByRole = (rows) => {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.role)) map.set(row.role, new Set());
    map.get(row.role).add(row.permission);
  }
  return map;
};

async function main() {
  const strict = hasFlag('--strict');
  const failOnExtra = strict;
  const errors = [];
  const warnings = [];

  const [rolePermissions, users] = await Promise.all([
    prisma.rolePermission.findMany({
      select: { role: true, permission: true },
      orderBy: [{ role: 'asc' }, { permission: 'asc' }],
    }),
    prisma.user.findMany({
      select: { id: true, email: true, role: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const unknownRoleInPermissions = rolePermissions
    .map((row) => row.role)
    .filter((role) => !EXPECTED_ROLES.has(role));

  const unknownRoleInUsers = users
    .map((row) => row.role)
    .filter((role) => !EXPECTED_ROLES.has(role));

  if (unknownRoleInPermissions.length) {
    errors.push(`role_permissions mengandung role tidak dikenal: ${[...new Set(unknownRoleInPermissions)].join(', ')}`);
  }
  if (unknownRoleInUsers.length) {
    errors.push(`users mengandung role tidak dikenal: ${[...new Set(unknownRoleInUsers)].join(', ')}`);
  }
  if (unknownRoleInPermissions.includes('ADMIN') || unknownRoleInUsers.includes('ADMIN')) {
    errors.push('Role ADMIN masih ditemukan. Role ini harus dihapus.');
  }

  const unknownPermissions = rolePermissions
    .map((row) => row.permission)
    .filter((permission) => !KNOWN_PERMISSIONS.has(permission));
  if (unknownPermissions.length) {
    errors.push(`Ditemukan permission tidak dikenal: ${[...new Set(unknownPermissions)].join(', ')}`);
  }

  const rolePermissionMap = normalizeRowsByRole(rolePermissions);

  for (const [role, requiredList] of Object.entries(REQUIRED_ROLE_MATRIX)) {
    const actual = rolePermissionMap.get(role) || new Set();
    const required = new Set(requiredList);
    const missing = requiredList.filter((permission) => !actual.has(permission));
    const extra = [...actual].filter((permission) => !required.has(permission));

    if (missing.length) {
      errors.push(`${role} kekurangan permission wajib: ${missing.join(', ')}`);
    }
    if (extra.length) {
      const message = `${role} punya permission tambahan di luar matrix default: ${extra.join(', ')}`;
      if (failOnExtra) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  const managerActual = rolePermissionMap.get('MANAGER') || new Set();
  const managerForbiddenFound = [...managerActual].filter((permission) => MANAGER_FORBIDDEN.has(permission));
  if (managerForbiddenFound.length) {
    errors.push(`MANAGER memiliki permission terlarang: ${managerForbiddenFound.join(', ')}`);
  }

  const userRoleCount = users.reduce((acc, row) => {
    acc[row.role] = (acc[row.role] || 0) + 1;
    return acc;
  }, {});

  console.log('Permission matrix check');
  console.log(`- Mode strict: ${strict ? 'YA' : 'TIDAK'}`);
  console.log(`- Total users: ${users.length}`);
  console.log(`- Total role_permissions: ${rolePermissions.length}`);
  summarizeList('Role users', Object.entries(userRoleCount).map(([role, count]) => `${role}=${count}`));

  for (const role of Object.keys(REQUIRED_ROLE_MATRIX)) {
    const total = (rolePermissionMap.get(role) || new Set()).size;
    console.log(`- ${role} permissions: ${total}`);
  }

  if (warnings.length) {
    console.log('\nWarnings:');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (errors.length) {
    console.error('\nErrors:');
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('\nOK: permission matrix valid.');
}

main()
  .catch((err) => {
    console.error('Gagal menjalankan check-permissions:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
