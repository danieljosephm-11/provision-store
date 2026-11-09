import { Router } from 'express';
import { authenticate, requireAnyPermission } from '../../middleware/auth';
import * as controller from './dashboard.controller';

const router = Router();
router.use(authenticate);

router.get('/', requireAnyPermission('dashboard.view', 'report.view'), controller.getDashboard);

export default router;
