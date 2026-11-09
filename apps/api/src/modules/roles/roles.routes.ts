import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import * as controller from './roles.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('role.read'), controller.listRoles);
router.get('/permissions', requirePermission('role.read'), controller.listPermissions);
router.post('/', requirePermission('role.manage'), controller.createRole);
router.patch('/:id', requirePermission('role.manage'), controller.updateRole);
router.delete('/:id', requirePermission('role.manage'), controller.deleteRole);

export default router;
