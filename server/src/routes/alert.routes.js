import { Router } from 'express';
import { sendTestEmail, alertRecipients } from '../controllers/incident.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const router = Router();
router.use(requireAuth);

router.post('/test', requireRole(ROLES.ADMIN, ROLES.SRE), sendTestEmail);
router.get('/recipients', requireRole(ROLES.ADMIN), alertRecipients);

export default router;
