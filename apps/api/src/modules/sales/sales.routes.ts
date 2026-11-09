import { Router } from 'express';
import { z } from 'zod';
import {
  invoiceCreateSchema,
  invoicePaymentSchema,
  saleReturnCreateSchema,
} from '@ps/shared';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './sales.controller';

const router = Router();
router.use(authenticate);

// Invoices (POS)
router.get('/invoices', requirePermission('invoice.read'), controller.listInvoices);
router.post('/invoices', requirePermission('pos.sell'), validate(invoiceCreateSchema), controller.createInvoice);
router.get('/invoices/:id/pdf', requirePermission('invoice.read'), controller.invoicePdf);
router.get('/invoices/:id/thermal', requirePermission('invoice.read'), controller.invoiceThermal);
router.get('/invoices/:id', requirePermission('invoice.read'), controller.getInvoice);
router.post(
  '/invoices/:id/void',
  requireAnyPermission('pos.void', 'invoice.void'),
  validate(z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) })),
  controller.voidInvoice,
);
router.post(
  '/invoices/:id/payments',
  requireAnyPermission('customer.payment', 'pos.sell'),
  validate(invoicePaymentSchema),
  controller.addPayment,
);

// Held bills
router.get('/held-bills', requirePermission('pos.hold'), controller.listHeldBills);
router.post(
  '/held-bills',
  requirePermission('pos.hold'),
  validate(
    z.object({
      name: z.string().trim().min(1).max(120),
      customerId: z.string().uuid().nullish(),
      payload: z.record(z.unknown()),
      subtotal: z.coerce.number().min(0).optional(),
    }),
  ),
  controller.createHeldBill,
);
router.patch(
  '/held-bills/:id',
  requirePermission('pos.hold'),
  validate(
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      customerId: z.string().uuid().nullish(),
      payload: z.record(z.unknown()).optional(),
      subtotal: z.coerce.number().min(0).optional(),
    }),
  ),
  controller.updateHeldBill,
);
router.delete('/held-bills/:id', requirePermission('pos.hold'), controller.deleteHeldBill);

// Sale returns
router.get('/returns', requirePermission('return.read'), controller.listReturns);
router.post(
  '/returns',
  requireAnyPermission('return.create', 'pos.return'),
  validate(saleReturnCreateSchema),
  controller.createReturn,
);
router.get('/returns/:id', requirePermission('return.read'), controller.getReturn);

export default router;
