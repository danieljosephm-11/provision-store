import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.isTest ? 'silent' : env.isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'tokenHash',
    ],
    censor: '[redacted]',
  },
  transport: undefined,
});
