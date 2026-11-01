import { Router } from 'express';
import { listIncidents, acknowledgeIncident } from '../controllers/incident.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const router = Router();
router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.SRE));

router.get('/', listIncidents);
router.post('/:id/acknowledge', acknowledgeIncident);

export default router;
