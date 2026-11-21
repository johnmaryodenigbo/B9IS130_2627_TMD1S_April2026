import { requestSubscription, confirmSubscription, unsubscribe, subscriberStats } from '../services/subscriptions.js';
import { describeMailError } from '../services/mailer.js';
import { AppError } from '../utils/AppError.js';

// POST /api/public/subscriptions { email, monitorIds? } — always the same answer (no address enumeration).
export async function subscribe(req, res) {
  try {
    await requestSubscription(req.body);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`Could not send the confirmation email: ${describeMailError(err)}`, 502);
  }
  res.status(202).json({ ok: true, message: 'Check your inbox for a confirmation link.' });
}

// POST /api/public/subscriptions/confirm { token }
export async function confirm(req, res) {
  res.json({ ok: true, ...(await confirmSubscription(req.body.token)) });
}

// POST /api/public/subscriptions/unsubscribe { token }
export async function remove(req, res) {
  res.json({ ok: true, ...(await unsubscribe(req.body.token)) });
}

// GET /api/subscribers (admin)
export async function stats(_req, res) {
  res.json(await subscriberStats());
}
