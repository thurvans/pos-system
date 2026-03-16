const logger = require('./logger');

const createPrismaClient = (PrismaClientClass, datasourceUrl) => {
  const client = new PrismaClientClass({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

  if (process.env.NODE_ENV === 'development') {
    client.$on('query', (e) => {
      logger.debug(`Query: ${e.query} | Params: ${e.params} | Duration: ${e.duration}ms`);
    });
  }

  client.$on('error', (e) => {
    logger.error('Prisma error:', e);
  });

  return client;
};

module.exports = { createPrismaClient };
