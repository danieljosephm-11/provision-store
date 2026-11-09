import type { Request, Response } from 'express';
import * as service from './inventory.service';

export async function list(req: Request, res: Response) {
  res.json(await service.listInventory(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function lowStock(req: Request, res: Response) {
  res.json(
    await service.listInventory(req.user!.storeId, { ...req.query, stockStatus: 'low', pageSize: req.query.pageSize ?? 100 }),
  );
}
export async function outOfStock(req: Request, res: Response) {
  res.json(
    await service.listInventory(req.user!.storeId, { ...req.query, stockStatus: 'out', pageSize: req.query.pageSize ?? 100 }),
  );
}
export async function productStock(req: Request, res: Response) {
  res.json({ item: await service.productStock(req.user!.storeId, String(req.params.productId)) });
}
export async function movements(req: Request, res: Response) {
  res.json(await service.listMovements(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function adjust(req: Request, res: Response) {
  res.status(201).json({
    item: await service.adjustStock(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function valuation(req: Request, res: Response) {
  res.json({ item: await service.valuation(req.user!.storeId) });
}
export async function expiring(req: Request, res: Response) {
  const days = Number(req.query.days ?? 30);
  res.json(await service.expiringBatches(req.user!.storeId, Number.isFinite(days) ? days : 30));
}

export async function listLocations(req: Request, res: Response) {
  res.json({ items: await service.listLocations(req.user!.storeId) });
}
export async function createLocation(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createLocation(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function updateLocation(req: Request, res: Response) {
  res.json({
    item: await service.updateLocation(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function deleteLocation(req: Request, res: Response) {
  res.json(await service.deleteLocation(req.user!.storeId, req.user!.id, String(req.params.id), req));
}

export async function createTransfer(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createTransfer(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function listTransfers(req: Request, res: Response) {
  res.json(await service.listTransfers(req.user!.storeId, req.query as Record<string, unknown>));
}
