import { Router } from 'express';
import { z } from 'zod';
import { changeStatusSchema, userCreateSchema, userUpdateSchema } from '@ps/shared';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './users.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('user.read'), controller.list);
router.get('/:id', requirePermission('user.read'), controller.get);
router.post('/', requirePermission('user.create'), validate(userCreateSchema), controller.create);
router.patch('/:id', requirePermission('user.update'), validate(userUpdateSchema), controller.update);
router.post(
  '/:id/status',
  requirePermission('user.update'),
  validate(changeStatusSchema),
  controller.setStatus,
);
router.post(
  '/:id/reset-password',
  requirePermission('user.update'),
  validate(
    z.object({
      newPassword: z
        .string()
        .min(10, 'Use at least 10 characters')
        .regex(/[A-Z]/, 'Include an uppercase letter')
        .regex(/[a-z]/, 'Include a lowercase letter')
        .regex(/[0-9]/, 'Include a number'),
    }),
  ),
  controller.resetPassword,
);
router.delete('/:id', requirePermission('user.delete'), controller.remove);

export default router;
