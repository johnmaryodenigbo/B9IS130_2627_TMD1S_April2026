import { Router } from 'express';
import {
  listMonitors, getMonitor, createMonitor, updateMonitor, deleteMonitor,
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

// ...only admins can change it.
router.post('/', requireRole(ROLES.ADMIN), validate(createMonitorSchema), createMonitor);
router.patch('/:id', requireRole(ROLES.ADMIN), validate(updateMonitorSchema), updateMonitor);
router.delete('/:id', requireRole(ROLES.ADMIN), deleteMonitor);

export default router;
