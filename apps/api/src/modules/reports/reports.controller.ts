import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { isReportKey, REPORT_KEYS, REPORT_TITLES, runReport } from './reports.service';
import { reportToExcel, reportToPdf } from './reports.export';

export async function listReports(_req: Request, res: Response) {
  res.json({
    items: REPORT_KEYS.map((key) => ({ key, title: REPORT_TITLES[key] })),
  });
}

export async function getReport(req: Request, res: Response) {
  const key = String(req.params.key);
  if (!isReportKey(key)) throw badRequest('Unknown report');
  res.json({ item: await runReport(req.user!.storeId, key, req.query as Record<string, unknown>) });
}

export async function exportReport(req: Request, res: Response) {
  const key = String(req.params.key);
  if (!isReportKey(key)) throw badRequest('Unknown report');
  const format = String(req.query.format ?? 'xlsx');
  if (format !== 'xlsx' && format !== 'pdf') throw badRequest('Unsupported export format');

  const [report, store] = await Promise.all([
    runReport(req.user!.storeId, key, req.query as Record<string, unknown>),
    prisma.store.findUnique({ where: { id: req.user!.storeId } }),
  ]);
  if (!store) throw notFound('Store');

  const filename = `${key}-${new Date().toISOString().slice(0, 10)}.${format}`;
  if (format === 'xlsx') {
    const buffer = await reportToExcel(report, store.name);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
    return;
  }
  const buffer = await reportToPdf(report, store.name);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}
