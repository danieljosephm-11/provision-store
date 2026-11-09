import type { Request, Response } from 'express';
import * as service from './catalog.service';
import { AppError } from '../../lib/errors';

// ── Categories ───────────────────────────────────────────────────────
export async function listCategories(req: Request, res: Response) {
  res.json({ items: await service.listCategories(req.user!.storeId) });
}
export async function createCategory(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createCategory(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function updateCategory(req: Request, res: Response) {
  res.json({
    item: await service.updateCategory(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function deleteCategory(req: Request, res: Response) {
  res.json(await service.deleteCategory(req.user!.storeId, req.user!.id, String(req.params.id), req));
}

// ── Brands ───────────────────────────────────────────────────────────
export async function listBrands(req: Request, res: Response) {
  res.json({ items: await service.listBrands(req.user!.storeId) });
}
export async function createBrand(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createBrand(req.user!.storeId, req.user!.id, req.body.name, req),
  });
}
export async function updateBrand(req: Request, res: Response) {
  res.json({
    item: await service.updateBrand(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function deleteBrand(req: Request, res: Response) {
  res.json(await service.deleteBrand(req.user!.storeId, req.user!.id, String(req.params.id), req));
}

// ── Units ────────────────────────────────────────────────────────────
export async function listUnits(req: Request, res: Response) {
  res.json({ items: await service.listUnits(req.user!.storeId) });
}
export async function createUnit(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createUnit(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function updateUnit(req: Request, res: Response) {
  res.json({
    item: await service.updateUnit(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function deleteUnit(req: Request, res: Response) {
  res.json(await service.deleteUnit(req.user!.storeId, req.user!.id, String(req.params.id), req));
}

// ── GST rates ────────────────────────────────────────────────────────
export async function listTaxRates(req: Request, res: Response) {
  res.json({ items: await service.listTaxRates(req.user!.storeId) });
}
export async function createTaxRate(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createTaxRate(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function updateTaxRate(req: Request, res: Response) {
  res.json({
    item: await service.updateTaxRate(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function deleteTaxRate(req: Request, res: Response) {
  res.json(await service.deleteTaxRate(req.user!.storeId, req.user!.id, String(req.params.id), req));
}

// ── Composite lookup for forms and POS ───────────────────────────────
export async function lookupOptions(req: Request, res: Response) {
  const storeId = req.user!.storeId;
  const [categories, brands, units, taxRates] = await Promise.all([
    service.listCategories(storeId),
    service.listBrands(storeId),
    service.listUnits(storeId),
    service.listTaxRates(storeId),
  ]);
  res.json({
    item: {
      categories: categories.filter((c) => c.isActive),
      brands: brands.filter((b) => b.isActive),
      units,
      taxRates: taxRates.filter((t) => t.isActive),
    },
  });
}

export function assertKnownResource(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new AppError(400, 'BAD_REQUEST', 'Invalid identifier');
  return value;
}
