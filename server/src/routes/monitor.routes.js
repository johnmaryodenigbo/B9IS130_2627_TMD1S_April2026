import { Router } from 'express';
import {
  listMonitors, getMonitor, createMonitor, updateMonitor, deleteMonitor, listChecks, checkNow,
} from '../controllers/monitor.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createMonitorSchema, updateMonitorSchema } from '../utils/validators.js';
import { ROLES } from '../utils/roles.js';

const router = Router();

router.use(requireAuth);

// Admins and SREs can view the inventory...
router.get('/', requireRole(ROLES.ADMIN, ROLES.SRE), listMonitors);
router.get('/:id', requireRole(ROLES.ADMIN, ROLES.SRE), getMonitor);
router.get('/:id/checks', requireRole(ROLES.ADMIN, ROLES.SRE), listChecks);
// Both roles can trigger a manual check (an on-call SRE verifying a fix).
router.post('/:id/check', requireRole(ROLES.ADMIN, ROLES.SRE), checkNow);

// ...only admins can change it.
router.post('/', requireRole(ROLES.ADMIN), validate(createMonitorSchema), createMonitor);
router.patch('/:id', requireRole(ROLES.ADMIN), validate(updateMonitorSchema), updateMonitor);
router.delete('/:id', requireRole(ROLES.ADMIN), deleteMonitor);

export default router;
