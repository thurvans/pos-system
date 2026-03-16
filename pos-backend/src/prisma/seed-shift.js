/**
 * Run after main seed:
 * npm run db:seed
 * npm run db:seed:shift
 */
const { PrismaClient } = require('../generated/client-node');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding shift data...');

  const cashier = await prisma.user.findUnique({ where: { email: 'kasir@pos.com' } });
  const branch = await prisma.branch.findFirst();

  if (!cashier || !branch) {
    throw new Error('Run main seed first: npm run db:seed');
  }

  const now = new Date();
  const openedAt = new Date(now);
  openedAt.setDate(openedAt.getDate() - 1);
  openedAt.setHours(8, 0, 0, 0);

  const closedAt = new Date(openedAt);
  closedAt.setHours(17, 0, 0, 0);

  const closedShift = await prisma.shift.create({
    data: {
      userId: cashier.id,
      branchId: branch.id,
      openingCash: 500000,
      closingCash: 1200000,
      status: 'CLOSED',
      openedAt,
      closedAt,
      cashMovements: {
        create: [
          { type: 'OPENING', amount: 500000, note: 'Modal awal shift', recordedBy: cashier.id },
          { type: 'CASH_OUT', amount: 50000, note: 'Beli plastik', recordedBy: cashier.id },
          { type: 'CLOSING', amount: 1200000, note: 'Penutupan shift', recordedBy: cashier.id },
        ],
      },
    },
  });

  console.log('Shift seed completed.');
  console.log(`Closed shift ID: ${closedShift.id}`);
}

main()
  .catch((error) => {
    console.error('Shift seed failed:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
