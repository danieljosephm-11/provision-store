import { Router } from 'express';
import { z } from 'zod';
import { inventoryAdjustSchema } from '@ps/shared';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './inventory.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('inventory.read'), controller.list);
router.get('/low-stock', requirePermission('inventory.read'), controller.lowStock);
router.get('/out-of-stock', requirePermission('inventory.read'), controller.outOfStock);
router.get('/valuation', requirePermission('inventory.read'), controller.valuation);
router.get('/expiring', requirePermission('inventory.read'), controller.expiring);
router.get('/movements', requirePermission('inventory.read'), controller.movements);
router.get('/products/:productId', requirePermission('inventory.read'), controller.productStock);
router.post(
  '/adjust',
  requirePermission('inventory.adjust'),
  validate(inventoryAdjustSchema),
  controller.adjust,
);

// Locations
router.get('/locations', requirePermission('inventory.read'), controller.listLocations);
router.post(
  '/locations',
  requirePermission('inventory.transfer'),
  validate(z.object({ name: z.string().trim().min(1).max(80), isDefault: z.boolean().default(false) })),
  controller.createLocation,
);
router.patch(
  '/locations/:id',
  requirePermission('inventory.transfer'),
  validate(z.object({ name: z.string().trim().min(1).max(80).optional(), isDefault: z.boolean().optional() })),
  controller.updateLocation,
);
router.delete('/locations/:id', requirePermission('inventory.transfer'), controller.deleteLocation);

// Transfers
router.get('/transfers', requirePermission('inventory.read'), controller.listTransfers);
router.post(
  '/transfers',
  requirePermission('inventory.transfer'),
  validate(
    z.object({
      fromLocationId: z.string().uuid(),
      toLocationId: z.string().uuid(),
      note: z.string().trim().max(500).nullish(),
      items: z
        .array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().positive() }))
        .min(1),
    }),
  ),
  controller.createTransfer,
);

export default router;
