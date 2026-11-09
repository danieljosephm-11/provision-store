import type { Request, Response } from 'express';
import * as service from './dashboard.service';

export async function getDashboard(req: Request, res: Response) {
  res.json({ item: await service.dashboard(req.user!.storeId, req.query as Record<string, unknown>) });
}
