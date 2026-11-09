import { Router } from 'express';
import { z } from 'zod';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '@ps/shared';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { authLimiter, loginLimiter } from '../../middleware/rate-limit';
import * as controller from './auth.controller';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), controller.login);
router.post('/refresh', authLimiter, controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);
router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  controller.forgotPassword,
);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), controller.resetPassword);
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  controller.changePassword,
);
router.patch(
  '/profile',
  authenticate,
  validate(
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().max(20).nullish(),
    }),
  ),
  controller.updateProfile,
);

export default router;
