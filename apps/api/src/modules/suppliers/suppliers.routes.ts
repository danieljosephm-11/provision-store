import { Router } from 'express';
import { supplierPaymentSchema, supplierSchema } from '@ps/shared';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './suppliers.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('supplier.read'), controller.list);
router.post('/', requirePermission('supplier.create'), validate(supplierSchema), controller.create);
router.get('/:id', requirePermission('supplier.read'), controller.get);
router.patch('/:id', requirePermission('supplier.update'), validate(supplierSchema.partial()), controller.update);
router.post('/:id/deactivate', requirePermission('supplier.delete'), controller.deactivate);
router.get('/:id/ledger', requirePermission('supplier.read'), controller.ledger);
router.post(
  '/:id/payments',
  requirePermission('supplier.payment'),
  validate(supplierPaymentSchema),
  controller.recordPayment,
);

export default router;
