import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import * as service from './sales.service';
import * as returns from './returns.service';
import { generateInvoicePdf, generateThermalPdf } from './pdf';

// ── Invoices ─────────────────────────────────────────────────────────
export async function listInvoices(req: Request, res: Response) {
  res.json(await service.listInvoices(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function createInvoice(req: Request, res: Response) {
  const result = await service.createInvoice(
    req.user!.storeId,
    req.user!.id,
    req.user!.permissions,
    req.body,
    req,
    req.get('idempotency-key') ?? undefined,
  );
  res.status(result.replayed ? 200 : 201).json(result);
}
export async function getInvoice(req: Request, res: Response) {
  res.json({ item: await service.getInvoice(req.user!.storeId, String(req.params.id)) });
}
export async function voidInvoice(req: Request, res: Response) {
  res.json({
    item: await service.voidInvoice(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body.reason,
      req,
    ),
  });
}
export async function addPayment(req: Request, res: Response) {
  res.status(201).json({
    item: await service.addInvoicePayment(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body,
      req,
    ),
  });
}
export async function invoicePdf(req: Request, res: Response) {
  const storeId = req.user!.storeId;
  const invoice = await service.getInvoice(storeId, String(req.params.id));
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw notFound('Store');
  const buffer = await generateInvoicePdf(store, invoice);
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${invoice.invoiceNo.replace(/[\\/]/g, '-')}.pdf"`,
  );
  res.send(buffer);
}
export async function invoiceThermal(req: Request, res: Response) {
  const storeId = req.user!.storeId;
  const invoice = await service.getInvoice(storeId, String(req.params.id));
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw notFound('Store');
  const buffer = await generateThermalPdf(store, invoice);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${invoice.invoiceNo.replace(/[\\/]/g, '-')}-thermal.pdf"`,
  );
  res.send(buffer);
}

// ── Held bills ───────────────────────────────────────────────────────
export async function listHeldBills(req: Request, res: Response) {
  res.json(await service.listHeldBills(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function createHeldBill(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createHeldBill(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function updateHeldBill(req: Request, res: Response) {
  res.json({
    item: await service.updateHeldBill(req.user!.storeId, req.user!.id, String(req.params.id), req.body, req),
  });
}
export async function deleteHeldBill(req: Request, res: Response) {
  res.json(await service.deleteHeldBill(req.user!.storeId, req.user!.id, String(req.params.id), req));
}

// ── Returns ──────────────────────────────────────────────────────────
export async function listReturns(req: Request, res: Response) {
  res.json(await returns.listSaleReturns(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function createReturn(req: Request, res: Response) {
  res.status(201).json({
    item: await returns.createSaleReturn(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function getReturn(req: Request, res: Response) {
  res.json({ item: await returns.getSaleReturn(req.user!.storeId, String(req.params.id)) });
}
