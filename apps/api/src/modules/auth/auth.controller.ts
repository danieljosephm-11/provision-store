import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import * as service from './auth.service';

export const REFRESH_COOKIE = 'ps_refresh';

function cookieOptions(): CookieOptions {
  const sameSite = env.COOKIE_SAME_SITE;
  return {
    httpOnly: true,
    // SameSite=None is only honoured on Secure cookies.
    secure: env.COOKIE_SECURE || sameSite === 'none',
    sameSite,
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function clearCookieOptions(): CookieOptions {
  const sameSite = env.COOKIE_SAME_SITE;
  return {
    path: '/api/v1/auth',
    secure: env.COOKIE_SECURE || sameSite === 'none',
    sameSite,
  };
}

function readRefresh(req: Request): string | undefined {
  return (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? req.body?.refreshToken;
}

export async function login(req: Request, res: Response) {
  const result = await service.login(req.body.email, req.body.password, req);
  res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
  const { refreshToken: _omit, ...body } = result;
  res.json(body);
}

export async function refresh(req: Request, res: Response) {
  try {
    const result = await service.refresh(readRefresh(req), req);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
    const { refreshToken: _omit, ...body } = result;
    res.json(body);
  } catch (error) {
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions());
    throw error;
  }
}

export async function logout(req: Request, res: Response) {
  await service.logout(readRefresh(req), req.user?.id);
  res.clearCookie(REFRESH_COOKIE, clearCookieOptions());
  res.json({ message: 'Signed out' });
}

export async function me(req: Request, res: Response) {
  res.json({ user: await service.me(req.user!.id) });
}

export async function forgotPassword(req: Request, res: Response) {
  res.json(await service.forgotPassword(req.body.email, req));
}

export async function resetPassword(req: Request, res: Response) {
  res.json(await service.resetPassword(req.body.token, req.body.password, req));
}

export async function changePassword(req: Request, res: Response) {
  res.json(
    await service.changePassword(
      req.user!.id,
      req.body.currentPassword,
      req.body.newPassword,
      req,
    ),
  );
}

export async function updateProfile(req: Request, res: Response) {
  res.json({ user: await service.updateProfile(req.user!.id, req.body, req) });
}
