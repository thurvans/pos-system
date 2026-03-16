const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  // Log
  if (err.isOperational) {
    logger.warn(`[${err.statusCode}] ${err.message}`, { path: req.path, method: req.method });
  } else {
    logger.error('Unexpected error:', {
      error: err.message,
      stack: err.stack,
      path:  req.path,
      method: req.method,
    });
  }

  // Prisma: duplicate key
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'field';
    return res.status(409).json({ error: `${field} sudah digunakan` });
  }
  // Prisma: record not found
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Data tidak ditemukan' });
  }
  // Prisma: foreign key constraint
  if (err.code === 'P2003') {
    return res.status(422).json({ error: 'Referensi data tidak valid' });
  }

  // Zod validation
  if (err.name === 'ZodError') {
    return res.status(422).json({
      error:   'Validasi gagal',
      details: err.errors.map((e) => ({
        field:   e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token tidak valid' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token sudah kadaluarsa' });
  }

  // AppError (operational)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.code && { code: err.code }),
    });
  }

  // Unknown — jangan bocorkan detail di production
  res.status(500).json({
    error: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Terjadi kesalahan pada server',
  });
};

module.exports = errorHandler;
