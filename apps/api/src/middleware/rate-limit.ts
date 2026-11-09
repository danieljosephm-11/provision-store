import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const disabled = () => env.isTest;

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabled,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabled,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in 15 minutes.' } },
});

/**
 * Token refresh happens on every app load, so it needs a much higher ceiling than
 * credential-recovery endpoints. Sharing the auth limiter caused ordinary page
 * reloads to exhaust the budget and sign the user out with a 429.
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabled,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many refresh attempts. Try again shortly.' } },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabled,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 15 minutes.' } },
});
