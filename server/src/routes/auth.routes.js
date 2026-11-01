import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, me, updateMe, changePassword } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, changePasswordSchema, updateMeSchema } from '../utils/validators.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many login attempts, please try again later' },
});

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, validate(updateMeSchema), updateMe);
router.patch('/me/password', requireAuth, validate(changePasswordSchema), changePassword);

export default router;
