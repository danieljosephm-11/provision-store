import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { unauthorized } from './errors';

export interface AccessTokenPayload {
  sub: string;
  storeId: string;
  roleId: string;
  role: string;
  type: 'access';
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'provision-store',
    audience: 'provision-store-web',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'provision-store',
      audience: 'provision-store-web',
    }) as AccessTokenPayload & jwt.JwtPayload;
    if (decoded.type !== 'access' || !decoded.sub) throw new Error('wrong token type');
    return decoded;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
}

/** Opaque refresh tokens: 384 bits of entropy, stored only as a SHA-256 hash. */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(raw).digest('hex');
}

export function generateResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
