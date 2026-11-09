import { Router } from 'express';
import { productSchema } from '@ps/shared';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { memoryUpload, productImageUpload } from '../../lib/upload';
import * as controller from './products.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('product.read'), controller.list);
router.get('/export', requirePermission('product.export'), controller.exportExcel);
router.get('/import-template', requirePermission('product.import'), controller.template);
router.post(
  '/import',
  requirePermission('product.import'),
  memoryUpload.single('file'),
  controller.importExcel,
);
router.get(
  '/lookup/:code',
  requireAnyPermission('pos.sell', 'product.read'),
  controller.lookup,
);
router.get('/barcode/:text', requirePermission('product.read'), controller.barcode);
router.get('/low-stock', requirePermission('product.read'), controller.lowStock);
router.get('/out-of-stock', requirePermission('product.read'), controller.outOfStock);
router.post('/', requirePermission('product.create'), validate(productSchema), controller.create);
router.post(
  '/import-image',
  requirePermission('product.update'),
  productImageUpload.single('file'),
  controller.uploadImage,
);
router.get('/:id', requirePermission('product.read'), controller.get);
router.patch(
  '/:id',
  requirePermission('product.update'),
  validate(productSchema.partial()),
  controller.update,
);
router.post('/:id/archive', requirePermission('product.archive'), controller.archive);
router.post('/:id/restore', requirePermission('product.archive'), controller.restore);

export default router;
