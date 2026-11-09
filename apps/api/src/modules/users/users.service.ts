import type { Request } from 'express';
import type { UserStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { writeAudit } from '../../lib/audit';
import { pageMeta, parsePagination } from '../../lib/pagination';

const publicSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
} as const;

export async function listUsers(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const status = query.status ? String(query.status) : undefined;

  const where = {
    storeId,
    deletedAt: null,
    ...(status ? { status: status as UserStatus } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: publicSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, meta: pageMeta(total, page, pageSize) };
}

export async function getUser(storeId: string, id: string) {
  const user = await prisma.user.findFirst({ where: { id, storeId, deletedAt: null }, select: publicSelect });
  if (!user) throw notFound('Employee');
  return user;
}

export async function createUser(
  storeId: string,
  actorId: string,
  input: {
    name: string;
    email: string;
    phone?: string | null;
    password: string;
    roleId: string;
    status?: UserStatus;
  },
  req: Request,
) {
  const role = await prisma.role.findFirst({ where: { id: input.roleId, storeId } });
  if (!role) throw badRequest('Select a valid role');

  const existing = await prisma.user.findFirst({
    where: { storeId, email: input.email.toLowerCase() },
  });
  if (existing) throw badRequest('An employee with this email already exists');

  const user = await prisma.user.create({
    data: {
      storeId,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
      roleId: input.roleId,
      status: input.status ?? 'ACTIVE',
      mustChangePassword: true,
    },
    select: publicSelect,
  });

  await writeAudit(
    {
      storeId,
      userId: actorId,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      after: { name: user.name, email: user.email, role: user.role.name },
      req,
    },
    undefined,
  );

  return user;
}

async function assertAdminRemains(storeId: string, targetUserId: string) {
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, storeId },
    include: { role: true },
  });
  if (!target) throw notFound('Employee');
  if (target.role.name !== 'Admin') return;

  const otherAdmins = await prisma.user.count({
    where: {
      storeId,
      deletedAt: null,
      status: 'ACTIVE',
      role: { name: 'Admin' },
      id: { not: targetUserId },
    },
  });
  if (otherAdmins === 0) throw forbidden('At least one active administrator must remain');
}

export async function updateUser(
  storeId: string,
  actorId: string,
  id: string,
  input: {
    name?: string;
    email?: string;
    phone?: string | null;
    roleId?: string;
    status?: UserStatus;
    password?: string;
  },
  req: Request,
) {
  const existing = await prisma.user.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!existing) throw notFound('Employee');

  if (input.roleId) {
    const role = await prisma.role.findFirst({ where: { id: input.roleId, storeId } });
    if (!role) throw badRequest('Select a valid role');
  }

  if (input.status && input.status !== 'ACTIVE') {
    if (id === actorId) throw forbidden('You cannot deactivate your own account');
    await assertAdminRemains(storeId, id);
  }

  if (input.roleId && input.roleId !== existing.roleId) {
    await assertAdminRemains(storeId, id);
  }

  if (input.email && input.email.toLowerCase() !== existing.email) {
    const dup = await prisma.user.findFirst({
      where: { storeId, email: input.email.toLowerCase(), id: { not: id } },
    });
    if (dup) throw badRequest('An employee with this email already exists');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.password
        ? { passwordHash: await hashPassword(input.password), mustChangePassword: true }
        : {}),
    },
    select: publicSelect,
  });

  if (input.password || input.status === 'INACTIVE' || input.status === 'SUSPENDED') {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await writeAudit(
    {
      storeId,
      userId: actorId,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      before: { name: existing.name, email: existing.email, status: existing.status },
      after: { name: updated.name, email: updated.email, status: updated.status },
      req,
    },
    undefined,
  );

  return updated;
}

export async function setUserStatus(
  storeId: string,
  actorId: string,
  id: string,
  status: UserStatus,
  req: Request,
) {
  if (id === actorId && status !== 'ACTIVE') {
    throw forbidden('You cannot deactivate your own account');
  }
  if (status !== 'ACTIVE') await assertAdminRemains(storeId, id);
  return updateUser(storeId, actorId, id, { status }, req);
}

export async function adminResetPassword(
  storeId: string,
  actorId: string,
  id: string,
  newPassword: string,
  req: Request,
) {
  const user = await prisma.user.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!user) throw notFound('Employee');
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: true },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await writeAudit(
    { storeId, userId: actorId, action: 'USER_PASSWORD_RESET_BY_ADMIN', entityType: 'User', entityId: id, req },
    undefined,
  );
  return { message: 'Password reset. The employee must change it at next sign-in.' };
}

export async function deleteUser(storeId: string, actorId: string, id: string, req: Request) {
  if (id === actorId) throw forbidden('You cannot delete your own account');
  const user = await prisma.user.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!user) throw notFound('Employee');
  await assertAdminRemains(storeId, id);

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await writeAudit(
    {
      storeId,
      userId: actorId,
      action: 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: id,
      before: { name: user.name, email: user.email },
      req,
    },
    undefined,
  );

  return { message: 'Employee deactivated' };
}
