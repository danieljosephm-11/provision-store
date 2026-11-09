import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { pageMeta, parsePagination } from '../../lib/pagination';

export async function listAuditLogs(req: Request, res: Response) {
  const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>);
  const q = req.query as Record<string, string | undefined>;

  const where = {
    storeId: req.user!.storeId,
    ...(q.action ? { action: { contains: q.action, mode: 'insensitive' as const } } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ items, meta: pageMeta(total, page, pageSize) });
}
