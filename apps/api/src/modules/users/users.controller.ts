import type { Request, Response } from 'express';
import * as service from './users.service';

export async function list(req: Request, res: Response) {
  res.json(await service.listUsers(req.user!.storeId, req.query as Record<string, unknown>));
}
export async function get(req: Request, res: Response) {
  res.json({ item: await service.getUser(req.user!.storeId, String(req.params.id)) });
}
export async function create(req: Request, res: Response) {
  res.status(201).json({
    item: await service.createUser(req.user!.storeId, req.user!.id, req.body, req),
  });
}
export async function update(req: Request, res: Response) {
  res.json({
    item: await service.updateUser(req.user!.storeId, req.user!.id, String(req.params.id), req.body, req),
  });
}
export async function setStatus(req: Request, res: Response) {
  res.json({
    item: await service.setUserStatus(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body.status,
      req,
    ),
  });
}
export async function resetPassword(req: Request, res: Response) {
  res.json(
    await service.adminResetPassword(
      req.user!.storeId,
      req.user!.id,
      String(req.params.id),
      req.body.newPassword,
      req,
    ),
  );
}
export async function remove(req: Request, res: Response) {
  res.json(await service.deleteUser(req.user!.storeId, req.user!.id, String(req.params.id), req));
}
