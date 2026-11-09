import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import * as controller from './store.controller';

const router = Router();

router.get('/public', controller.publicStoreInfo);
router.get('/', authenticate, requirePermission('settings.read'), controller.getStore);
router.patch('/', authenticate, requirePermission('settings.update'), controller.updateStore);

export default router;
