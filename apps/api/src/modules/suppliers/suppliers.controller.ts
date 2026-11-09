import type { Request, Response } from 'express';
import * as service from './suppliers.service';

export async function list(req: Request, res: Response) {
  res.json(await service.listSuppliers(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function get(req: Request, res: Response) {
  res.json({ item: await service.getSupplier(req.user!.storeId, String(req.params.id)) });
}
export async function create(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createSupplier(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function update(req: Request, res: Response) {
  res.json({
    item: await service.updateSupplier(req.user!.storeId, req.user!.id, String(req.params.id), req.body, req),
  });
}
export async function deactivate(req: Request, res: Response) {
  res.json(await service.deactivateSupplier(req.user!.storeId, req.user!.id, String(req.params.id), req));
}
export async function ledger(req: Request, res: Response) {
  res.json(
    await service.supplierLedger(
      req.user!.storeId,
      String(req.params.id),
      req.query as Record<string, unknown>,
    ),
  );
}
export async function recordPayment(req: Request, res: Response) {
  res.status(201).json({
    item: await service.recordSupplierPayment(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
