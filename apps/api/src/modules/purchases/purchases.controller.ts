import type { Request, Response } from 'express';
import * as service from './purchases.service';
import { recordSupplierPayment } from '../suppliers/suppliers.service';

// ── Purchases ────────────────────────────────────────────────────────
export async function list(req: Request, res: Response) {
  res.json(await service.listPurchases(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function get(req: Request, res: Response) {
  res.json({ item: await service.getPurchase(req.user!.storeId, String(req.params.id)) });
}
export async function create(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createPurchase(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function cancel(req: Request, res: Response) {
  res.json(
    await service.cancelPurchase(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body.reason,
      req,
    ),
  );
}
export async function pay(req: Request, res: Response) {
  const purchase = await service.getPurchase(req.user!.storeId, String(req.params.id));
  res.status(201).json({
    item: await recordSupplierPayment(
      req.user!.storeId,
      req.user!.id,
      purchase.supplierId,
      { ...req.body, purchaseId: purchase.id },
      req,
    ),
  });
}

// ── Purchase orders ──────────────────────────────────────────────────
export async function listOrders(req: Request, res: Response) {
  res.json(await service.listPurchaseOrders(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function getOrder(req: Request, res: Response) {
  res.json({ item: await service.getPurchaseOrder(req.user!.storeId, String(req.params.id)) });
}
export async function createOrder(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createPurchaseOrder(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function cancelOrder(req: Request, res: Response) {
  res.json(
    await service.cancelPurchaseOrder(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body.reason,
      req,
    ),
  );
}

// ── Purchase returns ─────────────────────────────────────────────────
export async function listReturns(req: Request, res: Response) {
  res.json(await service.listPurchaseReturns(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function createReturn(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createPurchaseReturn(req.user!.storeId, req.user!.id, req.body, req),
  });
}
