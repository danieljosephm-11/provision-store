import type { Request, Response } from 'express';
import * as service from './crm.service';

export async function overview(req: Request, res: Response) {
  res.json({ item: await service.crmOverview(req.user!.storeId) });
}

export async function audience(req: Request, res: Response) {
  res.json({
    item: await service.previewAudience(req.user!.storeId, req.query as Record<string, unknown>),
  });
}

export async function listCampaigns(req: Request, res: Response) {
  res.json(await service.listCampaigns(req.user!.storeId));
}

export async function createCampaign(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createCampaign(req.user!.storeId, req.user!.id, req.body, req),
  });
}

export async function getCampaign(req: Request, res: Response) {
  res.json({
    item: await service.getCampaign(req.user!.storeId, String(req.params.id)),
  });
}

export async function launchCampaign(req: Request, res: Response) {
  res.json({
    item: await service.launchCampaign(req.user!.storeId, req.user!.id, String(req.params.id), req),
  });
}

export async function markSent(req: Request, res: Response) {
  res.json({
    item: await service.markRecipientSent(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      String(req.params.recipientId),
      req,
    ),
  });
}

export async function completeCampaign(req: Request, res: Response) {
  res.json({
    item: await service.completeCampaign(req.user!.storeId, req.user!.id, String(req.params.id), req),
  });
}

export async function deleteCampaign(req: Request, res: Response) {
  res.json({
    item: await service.deleteCampaign(req.user!.storeId, req.user!.id, String(req.params.id), req),
  });
}
