import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import { storeSchema } from '@ps/shared';

export async function getStore(req: Request, res: Response) {
  const store = await prisma.store.findUnique({ where: { id: req.user!.storeId } });
  if (!store) throw notFound('Store');
  res.json({ item: store });
}

export async function updateStore(req: Request, res: Response) {
  const input = storeSchema.partial().parse(req.body);
  const before = await prisma.store.findUnique({ where: { id: req.user!.storeId } });
  if (!before) throw notFound('Store');

  const updated = await prisma.store.update({
    where: { id: req.user!.storeId },
    data: {
      ...input,
      legalName: input.legalName ?? undefined,
      gstin: input.gstin ?? undefined,
      email: input.email ?? undefined,
      pincode: input.pincode ?? undefined,
    },
  });

  await writeAudit({
    storeId: req.user!.storeId,
    userId: req.user!.id,
    action: 'STORE_UPDATED',
    entityType: 'Store',
    entityId: updated.id,
    before: { name: before.name, gstin: before.gstin, stateCode: before.stateCode },
    after: { name: updated.name, gstin: updated.gstin, stateCode: updated.stateCode },
    req,
  });

  res.json({ item: updated });
}

export async function publicStoreInfo(_req: Request, res: Response) {
  const store = await prisma.store.findFirst({
    select: {
      name: true,
      logoUrl: true,
      address: true,
      city: true,
      phone: true,
      email: true,
      gstin: true,
      invoicePrefix: true,
      taxEnabled: true,
      loyaltyEnabled: true,
    },
  });
  if (!store) throw notFound('Store');
  res.json({ item: store });
}
