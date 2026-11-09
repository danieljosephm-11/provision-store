import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError, forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';

export interface AuthContext {
  id: string;
  storeId: string;
  roleId: string;
  role: string;
  name: string;
  email: string;
  permissions: string[];
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthContext;
    }
  }
}

const PASSWORD_CHANGE_ALLOWED = new Set([
  'GET /api/v1/auth/me',
  'POST /api/v1/auth/change-password',
  'POST /api/v1/auth/logout',
]);

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const token = header.slice(7).trim();
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: {
        role: { include: { rolePermissions: { select: { permissionId: true } } } },
      },
    });

    if (!user || user.status !== 'ACTIVE') throw unauthorized('This account is not active');
    if (user.storeId !== payload.storeId) throw unauthorized('Session does not match this store');

    req.user = {
      id: user.id,
      storeId: user.storeId,
      roleId: user.roleId,
      role: user.role.name,
      name: user.name,
      email: user.email,
      permissions: user.role.rolePermissions.map((rp) => rp.permissionId),
      mustChangePassword: user.mustChangePassword,
    };

    if (user.mustChangePassword) {
      const route = `${req.method} ${req.baseUrl}${req.path}`;
      if (!PASSWORD_CHANGE_ALLOWED.has(route)) {
        throw new AppError(
          403,
          'PASSWORD_CHANGE_REQUIRED',
          'You must change your password before continuing',
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(...keys: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    const missing = keys.filter((k) => !req.user!.permissions.includes(k));
    if (missing.length) {
      return next(forbidden(`Missing permission: ${missing.join(', ')}`));
    }
    next();
  };
}

export function requireAnyPermission(...keys: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!keys.some((k) => req.user!.permissions.includes(k))) {
      return next(forbidden('You do not have access to this resource'));
    }
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}
