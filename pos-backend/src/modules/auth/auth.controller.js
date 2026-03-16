const { z } = require('zod');
const { loginService, refreshService, getPermissionsByRole } = require('./auth.service');
const prisma = require('../../config/prisma');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const login = async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await loginService(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const tokens = await refreshService(refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, role: true,
        branch: { select: { id: true, name: true } },
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const permissions = await getPermissionsByRole(user.role);
    res.json({ ...user, permissions });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, refreshToken, me };
