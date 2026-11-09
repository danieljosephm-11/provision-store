import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, forbidden, notFound, unauthorized } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import {
  generateRefreshToken,
  generateResetToken,
  hashToken,
  refreshExpiry,
  signAccessToken,
} from '../../lib/tokens';
import { writeAudit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

let dummyHash: string | null = null;
async function getDummyHash() {
  dummyHash ??= await hashPassword('__timing_only_not_a_real_password__');
  return dummyHash;
}

const authInclude = {
  role: { include: { rolePermissions: { select: { permissionId: true } } } },
  store: true,
} as const;

type UserWithAuth = Awaited<ReturnType<typeof findUserById>>;

async function findUserById(id: string) {
  return prisma.user.findFirst({ where: { id, deletedAt: null }, include: authInclude });
}

async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), deletedAt: null },
    include: authInclude,
  });
}

export function toAuthUser(user: NonNullable<UserWithAuth>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    role: { id: user.role.id, name: user.role.name },
    permissions: user.role.rolePermissions.map((rp) => rp.permissionId),
    store: {
      id: user.store.id,
      name: user.store.name,
      gstin: user.store.gstin,
      stateCode: user.store.stateCode,
      invoicePrefix: user.store.invoicePrefix,
      loyaltyEnabled: user.store.loyaltyEnabled,
      loyaltyPointValue: Number(user.store.loyaltyPointValue),
    },
  };
}

function issueAccess(user: NonNullable<UserWithAuth>) {
  return {
    accessToken: signAccessToken({
      sub: user.id,
      storeId: user.storeId,
      roleId: user.roleId,
      role: user.role.name,
    }),
    expiresIn: 15 * 60,
  };
}

async function createRefreshToken(userId: string, familyId: string, req?: Request) {
  const { raw, hash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hash,
      familyId,
      expiresAt: refreshExpiry(),
      ip: req?.ip ?? null,
      userAgent: req?.get('user-agent')?.slice(0, 300) ?? null,
    },
  });
  return raw;
}

export async function login(email: string, password: string, req: Request) {
  const user = await findUserByEmail(email);

  // Always run a hash comparison to avoid leaking whether an email exists.
  if (!user) {
    await verifyPassword(password, await getDummyHash());
    throw unauthorized('Invalid email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(423, 'ACCOUNT_LOCKED', `Account locked. Try again in ${minutes} minute(s).`);
  }

  if (user.status !== 'ACTIVE') {
    throw forbidden('This account is not active. Contact your administrator.');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      },
    });
    throw unauthorized(
      lock
        ? `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`
        : 'Invalid email or password',
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const familyId = randomUUID();
  const refreshToken = await createRefreshToken(user.id, familyId, req);
  const access = issueAccess(user);

  await writeAudit(
    {
      storeId: user.storeId,
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
      req,
    },
    undefined,
  );

  return { user: toAuthUser(user), ...access, refreshToken };
}

export async function refresh(rawToken: string | undefined, req: Request) {
  if (!rawToken) throw unauthorized('No refresh token provided');
  const hash = hashToken(rawToken);

  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    include: { user: { include: authInclude } },
  });

  if (!token) throw unauthorized('Invalid session. Please sign in again.');

  if (token.revokedAt) {
    // Reuse of a rotated token: assume theft, kill the whole token family.
    await prisma.refreshToken.updateMany({
      where: { familyId: token.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit({
      storeId: token.user.storeId,
      userId: token.userId,
      action: 'AUTH_REFRESH_REUSE_DETECTED',
      entityType: 'RefreshToken',
      entityId: token.id,
      req,
    });
    throw unauthorized('Session security violation detected. Please sign in again.');
  }

  if (token.expiresAt <= new Date()) throw unauthorized('Session expired. Please sign in again.');
  if (token.user.status !== 'ACTIVE' || token.user.deletedAt) {
    throw unauthorized('This account is not active');
  }

  const { raw, hash: newHash } = generateRefreshToken();
  const created = await prisma.refreshToken.create({
    data: {
      userId: token.userId,
      tokenHash: newHash,
      familyId: token.familyId,
      expiresAt: refreshExpiry(),
      ip: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
    },
  });

  await prisma.refreshToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date(), replacedByTokenId: created.id },
  });

  return { user: toAuthUser(token.user), ...issueAccess(token.user), refreshToken: raw };
}

export async function logout(rawToken: string | undefined, userId?: string) {
  if (rawToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else if (userId) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export async function me(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw unauthorized();
  return toAuthUser(user);
}

export async function forgotPassword(email: string, req: Request) {
  const user = await findUserByEmail(email);
  const generic = {
    message: 'If an account exists for this email, a password reset link has been generated.',
  };
  if (!user) return generic;

  const { raw, hash } = generateResetToken();
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 30 * 60000) },
  });

  const link = `${env.APP_URL}/reset-password?token=${raw}`;
  logger.info({ userId: user.id, link }, 'Password reset link generated (configure SMTP to email it)');
  await writeAudit({
    storeId: user.storeId,
    userId: user.id,
    action: 'AUTH_FORGOT_PASSWORD',
    entityType: 'User',
    entityId: user.id,
    req,
  });

  // In development the link is returned so the workflow is testable without SMTP.
  return env.isProd ? generic : { ...generic, resetToken: raw, resetUrl: link };
}

export async function resetPassword(token: string, password: string, req: Request) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw badRequest('This reset link is invalid or has expired. Request a new one.');
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await writeAudit({
    storeId: record.user.storeId,
    userId: record.userId,
    action: 'AUTH_RESET_PASSWORD',
    entityType: 'User',
    entityId: record.userId,
    req,
  });

  return { message: 'Password updated. You can sign in with your new password.' };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  req: Request,
) {
  const user = await findUserById(userId);
  if (!user) throw notFound('User');
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw badRequest('Current password is incorrect');
  if (currentPassword === newPassword) throw badRequest('New password must be different');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await writeAudit({
    storeId: user.storeId,
    userId,
    action: 'AUTH_CHANGE_PASSWORD',
    entityType: 'User',
    entityId: userId,
    req,
  });

  return { message: 'Password changed. Please sign in again.' };
}

export async function updateProfile(
  userId: string,
  input: { name?: string; phone?: string | null },
  req: Request,
) {
  const user = await findUserById(userId);
  if (!user) throw notFound('User');
  await prisma.user.update({
    where: { id: userId },
    data: { name: input.name, phone: input.phone },
  });
  await writeAudit({
    storeId: user.storeId,
    userId,
    action: 'USER_PROFILE_UPDATED',
    entityType: 'User',
    entityId: userId,
    before: { name: user.name, phone: user.phone },
    after: input,
    req,
  });
  const updated = await findUserById(userId);
  return toAuthUser(updated!);
}
