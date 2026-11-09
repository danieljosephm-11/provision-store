import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && incoming.length <= 100 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}
