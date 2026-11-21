import { Router } from 'express';
import { stats } from '../controllers/subscription.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const router = Router();
router.get('/', requireAuth, requireRole(ROLES.ADMIN), stats);
export default router;
