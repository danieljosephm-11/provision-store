import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import * as controller from './reports.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('report.view'), controller.listReports);
router.get('/:key/export', requirePermission('report.export'), controller.exportReport);
router.get('/:key', requirePermission('report.view'), controller.getReport);

export default router;
