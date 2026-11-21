import { Router } from 'express';
import { listPublicMonitors } from '../controllers/monitor.controller.js';
import { listPublicIncidents } from '../controllers/incident.controller.js';
import rateLimit from 'express-rate-limit';
import { createReport } from '../controllers/report.controller.js';
import { validate } from '../middleware/validate.js';
import { createReportSchema, subscribeSchema, tokenSchema } from '../utils/validators.js';
import { subscribe, confirm, remove } from '../controllers/subscription.controller.js';

// No authentication: used by the anonymous status dashboard.
const router = Router();

router.get('/monitors', listPublicMonitors);
router.get('/incidents', listPublicIncidents);

// Anyone can report a problem; limit how many reports one IP can send overall.
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many reports from your network, please try again later' },
});
router.post('/monitors/:id/reports', reportLimiter, validate(createReportSchema), createReport);

// "Get notified": email sign-up with double opt-in. Limited per IP so nobody can mass-mail strangers.
const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many sign-ups from your network, please try again later' },
});
router.post('/subscriptions', subscribeLimiter, validate(subscribeSchema), subscribe);
router.post('/subscriptions/confirm', validate(tokenSchema), confirm);
router.post('/subscriptions/unsubscribe', validate(tokenSchema), remove);

export default router;
