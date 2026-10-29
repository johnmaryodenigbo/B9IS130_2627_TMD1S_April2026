import { Router } from 'express';
import { listPublicMonitors } from '../controllers/monitor.controller.js';

// No authentication: used by the anonymous status dashboard.
const router = Router();

router.get('/monitors', listPublicMonitors);

export default router;
