import { Router } from 'express';
import {
  customerActivitySchema,
  customerActivityUpdateSchema,
  customerImportSchema,
  customerPaymentSchema,
  customerSchema,
} from '@ps/shared';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './customers.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('customer.read'), controller.list);
router.get('/summary', requirePermission('customer.read'), controller.summary);
router.get('/export', requirePermission('customer.read'), controller.exportCsv);
router.post('/import', requirePermission('customer.create'), validate(customerImportSchema), controller.importCsv);
router.get('/follow-ups', requirePermission('customer.read'), controller.followUps);
router.get('/occasions', requirePermission('customer.read'), controller.occasions);
router.post('/segments/recalculate', requirePermission('customer.update'), controller.recalculateSegments);
router.post('/', requirePermission('customer.create'), validate(customerSchema), controller.create);
router.get('/:id', requirePermission('customer.read'), controller.get);
router.patch('/:id', requirePermission('customer.update'), validate(customerSchema.partial()), controller.update);
router.post('/:id/deactivate', requirePermission('customer.delete'), controller.deactivate);
router.get('/:id/ledger', requirePermission('customer.read'), controller.ledger);
router.get('/:id/timeline', requirePermission('customer.read'), controller.timeline);
router.post(
  '/:id/activities',
  requirePermission('customer.activity'),
  validate(customerActivitySchema),
  controller.createActivity,
);
router.patch(
  '/:id/activities/:activityId',
  requirePermission('customer.activity'),
  validate(customerActivityUpdateSchema),
  controller.updateActivity,
);
router.delete(
  '/:id/activities/:activityId',
  requirePermission('customer.activity'),
  controller.deleteActivity,
);
router.post(
  '/:id/payments',
  requirePermission('customer.payment'),
  validate(customerPaymentSchema),
  controller.recordPayment,
);

export default router;
