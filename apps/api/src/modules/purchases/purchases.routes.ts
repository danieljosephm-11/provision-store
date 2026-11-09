import { Router } from 'express';
import { z } from 'zod';
import {
  purchaseCreateSchema,
  purchaseOrderCreateSchema,
  purchaseReturnCreateSchema,
  supplierPaymentSchema,
} from '@ps/shared';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './purchases.controller';

const router = Router();
router.use(authenticate);

const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });

// Purchases
router.get('/purchases', requirePermission('purchase.read'), controller.list);
router.post('/purchases', requirePermission('purchase.create'), validate(purchaseCreateSchema), controller.create);
router.get('/purchases/:id', requirePermission('purchase.read'), controller.get);
router.post('/purchases/:id/cancel', requirePermission('purchase.create'), validate(cancelSchema), controller.cancel);
router.post(
  '/purchases/:id/payments',
  requireAnyPermission('purchase.pay', 'supplier.payment'),
  validate(supplierPaymentSchema),
  controller.pay,
);

// Purchase orders
router.get('/purchase-orders', requirePermission('purchase.read'), controller.listOrders);
router.post(
  '/purchase-orders',
  requirePermission('purchase.create'),
  validate(purchaseOrderCreateSchema),
  controller.createOrder,
);
router.get('/purchase-orders/:id', requirePermission('purchase.read'), controller.getOrder);
router.post(
  '/purchase-orders/:id/cancel',
  requirePermission('purchase.create'),
  validate(cancelSchema),
  controller.cancelOrder,
);

// Purchase returns
router.get('/purchase-returns', requirePermission('purchase.read'), controller.listReturns);
router.post(
  '/purchase-returns',
  requirePermission('purchase.return'),
  validate(purchaseReturnCreateSchema),
  controller.createReturn,
);

export default router;
