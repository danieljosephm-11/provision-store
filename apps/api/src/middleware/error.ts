import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  // Anything that is not an API or upload request is a browser visit: send it
  // to the web app so http://localhost:4000 and deep links still work.
  const isApiRequest =
    req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/uploads/');
  if (req.method === 'GET' && !isApiRequest) {
    res.redirect(302, `${env.APP_URL.replace(/\/$/, '')}${req.originalUrl}`);
    return;
  }

  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      requestId: req.requestId,
    },
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Please correct the highlighted fields';
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      (fields[key] ??= []).push(issue.message);
    }
    details = fields;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      code = 'DUPLICATE';
      const target = Array.isArray(err.meta?.target) ? (err.meta?.target as string[]).join(', ') : 'value';
      message = `A record with this ${target} already exists`;
    } else if (err.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'The requested record was not found';
    } else if (err.code === 'P2023') {
      status = 400;
      code = 'INVALID_IDENTIFIER';
      message = 'The identifier in the request is not valid';
    } else if (err.code === 'P2003') {
      status = 409;
      code = 'REFERENCE_ERROR';
      message = 'This record is referenced by other data and cannot be changed';
    } else if (err.code === 'P2034') {
      status = 409;
      code = 'CONFLICT';
      message = 'The record changed while you were saving. Please retry.';
    }
  } else if (err instanceof SyntaxError && 'body' in err) {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  }

  if (status >= 500) {
    logger.error({ err, requestId: req.requestId, route: req.originalUrl }, 'Unhandled request error');
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(env.isProd ? {} : { requestId: req.requestId }),
      requestId: req.requestId,
    },
  });
}
