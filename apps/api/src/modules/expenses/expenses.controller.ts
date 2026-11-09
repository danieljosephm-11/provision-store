import type { Request, Response } from 'express';
import * as service from './expenses.service';

export async function listCategories(req: Request, res: Response) {
  res.json({ items: await service.listExpenseCategories(req.user!.storeId) });
}
export async function createCategory(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createExpenseCategory(req.user!.storeId, req.user!.id, req.body.name, req),
  });
}
export async function updateCategory(req: Request, res: Response) {
  res.json({
    item: await service.updateExpenseCategory(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function deleteCategory(req: Request, res: Response) {
  res.json(await service.deleteExpenseCategory(req.user!.storeId, req.user!.id, String(req.params.id), req));
}

export async function list(req: Request, res: Response) {
  res.json(await service.listExpenses(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function summary(req: Request, res: Response) {
  res.json({ item: await service.expenseSummary(req.user!.storeId, req.query as Record<string, unknown>) });
}
export async function get(req: Request, res: Response) {
  res.json({ item: await service.getExpense(req.user!.storeId, String(req.params.id)) });
}
export async function create(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createExpense(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function update(req: Request, res: Response) {
  res.json({
    item: await service.updateExpense(req.user!.storeId, req.user!.id, String(req.params.id), req.body, req),
  });
}
export async function reverse(req: Request, res: Response) {
  res.json({
    item: await service.reverseExpense(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body.reason,
      req,
    ),
  });
}
