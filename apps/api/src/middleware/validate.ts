import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../lib/errors';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return next(
        new AppError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields', fieldErrors),
      );
    }
    // Parsed (and coerced) values replace the raw input.
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}
