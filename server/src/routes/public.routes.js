import { Router } from 'express';
import { listPublicMonitors } from '../controllers/monitor.controller.js';
import { listPublicIncidents } from '../controllers/incident.controller.js';

// No authentication: used by the anonymous status dashboard.
const router = Router();

router.get('/monitors', listPublicMonitors);
router.get('/incidents', listPublicIncidents);

export default router;
