import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, deleteUser } from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createUserSchema, updateUserSchema } from '../utils/validators.js';
import { ROLES } from '../utils/roles.js';

const router = Router();

// Every user-management route is admin-only.
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get('/', listUsers);
router.post('/', validate(createUserSchema), createUser);
router.get('/:id', getUser);
router.patch('/:id', validate(updateUserSchema), updateUser);
router.delete('/:id', deleteUser);

export default router;
