import type { Request, Response } from 'express';
import * as service from './products.service';

export async function list(req: Request, res: Response) {
  res.json(
    await service.listProducts(req.user!.storeId, req.user!.permissions, req.query as Record<string, unknown>),
  );
}
export async function get(req: Request, res: Response) {
  res.json({ item: await service.getProduct(req.user!.storeId, req.user!.permissions, String(req.params.id)) });
}
export async function lowStock(req: Request, res: Response) {
  res.json(
    await service.listProducts(req.user!.storeId, req.user!.permissions, {
      ...(req.query as Record<string, unknown>),
      stockStatus: 'low',
    }),
  );
}
export async function outOfStock(req: Request, res: Response) {
  res.json(
    await service.listProducts(req.user!.storeId, req.user!.permissions, {
      ...(req.query as Record<string, unknown>),
      stockStatus: 'out',
    }),
  );
}
export async function lookup(req: Request, res: Response) {
  const item = await service.findForSale(req.user!.storeId, String(req.params.code));
  res.json({ item });
}
export async function create(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createProduct(
      req.user!.storeId,
      req.user!.id,
      req.user!.permissions,
      req.body,
      req,
    ),
  });
}
export async function update(req: Request, res: Response) {
  res.json({
    item: await service.updateProduct(
      req.user!.storeId,
      req.user!.id,
      req.user!.permissions,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function archive(req: Request, res: Response) {
  res.json(await service.archiveProduct(req.user!.storeId, req.user!.id, String(req.params.id), req));
}
export async function restore(req: Request, res: Response) {
  res.json(await service.restoreProduct(req.user!.storeId, req.user!.id, String(req.params.id), req));
}
export async function barcode(req: Request, res: Response) {
  const png = await service.generateBarcodePng(String(req.params.text));
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(png);
}
export async function exportExcel(req: Request, res: Response) {
  const buffer = await service.exportProducts(req.user!.storeId);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buffer);
}
export async function template(_req: Request, res: Response) {
  const buffer = await service.buildImportTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
  res.send(buffer);
}
export async function importExcel(req: Request, res: Response) {
  if (!req.file) throw new Error('Upload an .xlsx file');
  res.json(
    await service.importProducts(req.user!.storeId, req.user!.id, req.file.buffer),
  );
}
export async function uploadImage(req: Request, res: Response) {
  if (!req.file) throw new Error('Upload an image');
  const url = `/uploads/products/${req.file.filename}`;
  res.status(201).json({ url });
}
