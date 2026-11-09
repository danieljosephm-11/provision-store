import { Router } from 'express';
import { campaignSchema } from '@ps/shared';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './crm.controller';

const router = Router();
router.use(authenticate);

router.get('/overview', requirePermission('customer.read'), controller.overview);
router.get('/audience', requirePermission('customer.read'), controller.audience);

router.get('/campaigns', requirePermission('customer.read'), controller.listCampaigns);
router.post('/campaigns', requirePermission('customer.campaign'), validate(campaignSchema), controller.createCampaign);
router.get('/campaigns/:id', requirePermission('customer.read'), controller.getCampaign);
router.post('/campaigns/:id/launch', requirePermission('customer.campaign'), controller.launchCampaign);
router.post(
  '/campaigns/:id/recipients/:recipientId/sent',
  requirePermission('customer.campaign'),
  controller.markSent,
);
router.post('/campaigns/:id/complete', requirePermission('customer.campaign'), controller.completeCampaign);
router.delete('/campaigns/:id', requirePermission('customer.campaign'), controller.deleteCampaign);

export default router;
