import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, deleteUser } from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Every user-management route is admin-only.

router.get('/', listUsers);
router.get('/:id', getUser);
router.delete('/:id', deleteUser);

export default router;
