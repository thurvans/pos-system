const { PrismaClient } = require('../generated/client-node');
const { createPrismaClient } = require('./prismaClientFactory');

const prisma = createPrismaClient(PrismaClient, process.env.DATABASE_URL);

module.exports = prisma;
