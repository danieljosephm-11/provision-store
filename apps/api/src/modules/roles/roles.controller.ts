import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

export async function listRoles(req: Request, res: Response) {
  const roles = await prisma.role.findMany({
    where: { storeId: req.user!.storeId },
    orderBy: { createdAt: 'asc' },
    include: {
      rolePermissions: { select: { permissionId: true } },
      _count: { select: { users: { where: { deletedAt: null } } } },
    },
  });
  res.json({
    items: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissionKeys: r.rolePermissions.map((rp) => rp.permissionId),
      createdAt: r.createdAt,
    })),
  });
}

export async function listPermissions(_req: Request, res: Response) {
  const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
  const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});
  res.json({ items: permissions, grouped });
}

const roleInputSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(200).nullish(),
  permissionKeys: z.array(z.string()).default([]),
});

export async function createRole(req: Request, res: Response) {
  const input = roleInputSchema.parse(req.body);
  if (input.name.toLowerCase() === 'admin') throw badRequest('Admin role already exists');

  const valid = await prisma.permission.findMany({
    where: { key: { in: input.permissionKeys } },
    select: { key: true },
  });
  const keys = valid.map((p) => p.key);

  const role = await prisma.role.create({
    data: {
      storeId: req.user!.storeId,
      name: input.name,
      description: input.description ?? null,
      isSystem: false,
      rolePermissions: { create: keys.map((permissionId) => ({ permissionId })) },
    },
    include: { rolePermissions: { select: { permissionId: true } } },
  });

  await writeAudit({
    storeId: req.user!.storeId,
    userId: req.user!.id,
    action: 'ROLE_CREATED',
    entityType: 'Role',
    entityId: role.id,
    after: { name: role.name, permissionKeys: keys },
    req,
  });

  res.status(201).json({
    item: {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissionKeys: role.rolePermissions.map((rp) => rp.permissionId),
    },
  });
}

export async function updateRole(req: Request, res: Response) {
  const role = await prisma.role.findFirst({
    where: { id: String(req.params.id), storeId: req.user!.storeId },
  });
  if (!role) throw notFound('Role');
  if (role.name === 'Admin') throw forbidden('The Admin role always has every permission');

  const input = roleInputSchema.partial().parse(req.body);
  if (input.name && input.name.toLowerCase() === 'admin') {
    throw badRequest('That role name is reserved');
  }

  const validKeys = input.permissionKeys
    ? (
        await prisma.permission.findMany({
          where: { key: { in: input.permissionKeys } },
          select: { key: true },
        })
      ).map((p) => p.key)
    : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.name !== undefined || input.description !== undefined) {
      await tx.role.update({
        where: { id: role.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      });
    }
    if (validKeys) {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (validKeys.length) {
        await tx.rolePermission.createMany({
          data: validKeys.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }
    }
    return tx.role.findUniqueOrThrow({
      where: { id: role.id },
      include: { rolePermissions: { select: { permissionId: true } } },
    });
  });

  await writeAudit({
    storeId: req.user!.storeId,
    userId: req.user!.id,
    action: 'ROLE_UPDATED',
    entityType: 'Role',
    entityId: role.id,
    before: { name: role.name },
    after: { name: updated.name, permissionKeys: updated.rolePermissions.map((rp) => rp.permissionId) },
    req,
  });

  res.json({
    item: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      isSystem: updated.isSystem,
      permissionKeys: updated.rolePermissions.map((rp) => rp.permissionId),
    },
  });
}

export async function deleteRole(req: Request, res: Response) {
  const role = await prisma.role.findFirst({
    where: { id: String(req.params.id), storeId: req.user!.storeId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw notFound('Role');
  if (role.isSystem) throw forbidden('System roles cannot be deleted');
  if (role._count.users > 0) throw badRequest('Move employees to another role before deleting this one');

  await prisma.role.delete({ where: { id: role.id } });
  await writeAudit({
    storeId: req.user!.storeId,
    userId: req.user!.id,
    action: 'ROLE_DELETED',
    entityType: 'Role',
    entityId: role.id,
    before: { name: role.name },
    req,
  });
  res.json({ message: 'Role deleted' });
}
