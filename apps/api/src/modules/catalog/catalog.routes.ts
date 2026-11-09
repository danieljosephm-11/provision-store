import { Router } from 'express';
import { z } from 'zod';
import { brandSchema, categorySchema, taxRateSchema, unitSchema } from '@ps/shared';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './catalog.controller';

const router = Router();
router.use(authenticate);

router.get(
  '/options',
  requireAnyPermission('product.read', 'pos.sell', 'category.manage', 'brand.manage', 'unit.manage', 'tax.manage'),
  controller.lookupOptions,
);

// Categories
router.get('/categories', requireAnyPermission('product.read', 'category.manage'), controller.listCategories);
router.post('/categories', requirePermission('category.manage'), validate(categorySchema), controller.createCategory);
router.patch('/categories/:id', requirePermission('category.manage'), validate(categorySchema.partial()), controller.updateCategory);
router.delete('/categories/:id', requirePermission('category.manage'), controller.deleteCategory);

// Brands
router.get('/brands', requireAnyPermission('product.read', 'brand.manage'), controller.listBrands);
router.post('/brands', requirePermission('brand.manage'), validate(brandSchema), controller.createBrand);
router.patch(
  '/brands/:id',
  requirePermission('brand.manage'),
  validate(z.object({ name: z.string().trim().min(1).max(80).optional(), isActive: z.boolean().optional() })),
  controller.updateBrand,
);
router.delete('/brands/:id', requirePermission('brand.manage'), controller.deleteBrand);

// Units
router.get('/units', requireAnyPermission('product.read', 'unit.manage'), controller.listUnits);
router.post('/units', requirePermission('unit.manage'), validate(unitSchema), controller.createUnit);
router.patch('/units/:id', requirePermission('unit.manage'), validate(unitSchema.partial()), controller.updateUnit);
router.delete('/units/:id', requirePermission('unit.manage'), controller.deleteUnit);

// GST rates
router.get('/tax-rates', requireAnyPermission('product.read', 'tax.manage'), controller.listTaxRates);
router.post('/tax-rates', requirePermission('tax.manage'), validate(taxRateSchema), controller.createTaxRate);
router.patch('/tax-rates/:id', requirePermission('tax.manage'), validate(taxRateSchema.partial()), controller.updateTaxRate);
router.delete('/tax-rates/:id', requirePermission('tax.manage'), controller.deleteTaxRate);

export default router;
