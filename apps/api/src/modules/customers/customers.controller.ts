import type { Request, Response } from 'express';
import * as service from './customers.service';

export async function list(req: Request, res: Response) {
  res.json(await service.listCustomers(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function summary(req: Request, res: Response) {
  res.json({ item: await service.outstandingSummary(req.user!.storeId) });
}
export async function get(req: Request, res: Response) {
  res.json({ item: await service.getCustomer(req.user!.storeId, String(req.params.id)) });
}
export async function create(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createCustomer(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function update(req: Request, res: Response) {
  res.json({
    item: await service.updateCustomer(
      req.user!.storeId,
      req.user!.id,
      req.user!.permissions,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function deactivate(req: Request, res: Response) {
  res.json(await service.deactivateCustomer(req.user!.storeId, req.user!.id, String(req.params.id), req));
}
export async function ledger(req: Request, res: Response) {
  res.json(
    await service.customerLedger(
      req.user!.storeId,
      String(req.params.id),
      req.query as Record<string, unknown>,
    ),
  );
}
export async function recordPayment(req: Request, res: Response) {
  res.status(201).json({
    item: await service.recordCustomerPayment(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function exportCsv(req: Request, res: Response) {
  const csv = await service.exportCustomersCsv(req.user!.storeId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  res.send(csv);
}
export async function importCsv(req: Request, res: Response) {
  res.status(201).json({
    item: await service.importCustomersCsv(req.user!.storeId, req.user!.id, req.body.csv, req),
  });
}
export async function followUps(req: Request, res: Response) {
  res.json(
    await service.listFollowUps(req.user!.storeId, req.query as Record<string, unknown>),
  );
}
export async function occasions(req: Request, res: Response) {
  res.json({ item: await service.listOccasions(req.user!.storeId) });
}
export async function recalculateSegments(req: Request, res: Response) {
  res.json({
    item: await service.recalculateSegments(req.user!.storeId, req.user!.id, req),
  });
}
export async function timeline(req: Request, res: Response) {
  res.json(
    await service.customerTimeline(
      req.user!.storeId,
      String(req.params.id),
      req.query as Record<string, unknown>,
    ),
  );
}
export async function createActivity(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createActivity(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function updateActivity(req: Request, res: Response) {
  res.json({
    item: await service.updateActivity(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      String(req.params.activityId),
      req.body,
      req,
    ),
  });
}
export async function deleteActivity(req: Request, res: Response) {
  res.json({
    item: await service.deleteActivity(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      String(req.params.activityId),
      req,
    ),
  });
}
