import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import * as controller from './audit.controller';

const router = Router();
router.use(authenticate);
router.get('/', requirePermission('audit.read'), controller.listAuditLogs);
export default router;
