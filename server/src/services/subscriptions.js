import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { Monitor } from '../models/Monitor.js';
import { Subscriber } from '../models/Subscriber.js';
import { Incident } from '../models/Incident.js';
import { AppError } from '../utils/AppError.js';
import { sendMail, describeMailError } from './mailer.js';
import { subscribeConfirmEmail, visitorIncidentEmail } from './emailTemplates.js';

const RESEND_CONFIRM_MS = 2 * 60 * 1000; // don't resend the confirmation more often than this
const SEND_CONCURRENCY = 5;

const newToken = () => crypto.randomBytes(24).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// Only public, existing monitors can be subscribed to.
async function publicMonitors(ids = []) {
  if (!ids.length) return [];
  const found = await Monitor.find({ _id: { $in: ids }, isPublic: true }, 'name environment').lean();
  if (found.length !== new Set(ids.map(String)).size) throw new AppError('Unknown service in your selection', 400);
  return found;
}

/**
 * A visitor asked for updates. Always sends a confirmation link (double opt-in), also for an
 * existing subscriber changing their selection. The response never reveals whether the
 * address was already subscribed.
 */
export async function requestSubscription({ email, monitorIds = [] }) {
  if (!env.subscriptionsEnabled) throw new AppError('Email updates are not available', 404);
  const monitors = await publicMonitors(monitorIds);
  const token = newToken();

  const existing = await Subscriber.findOne({ email });
  if (existing?.confirmSentAt && Date.now() - existing.confirmSentAt.getTime() < RESEND_CONFIRM_MS) {
    return { sent: false }; // quietly ignore rapid repeats
  }

  const sub = existing ?? new Subscriber({ email, unsubscribeToken: newToken() });
  sub.pendingMonitors = monitors.map((m) => m._id);
  sub.confirmTokenHash = hashToken(token);
  sub.confirmSentAt = new Date();
  await sub.save();

  await sendMail({
    to: email,
    ...subscribeConfirmEmail({
      monitorNames: monitors.map((m) => `${m.name} (${m.environment})`),
      confirmUrl: `${env.appUrl}/subscribe/confirm?token=${token}`,
      appUrl: env.appUrl,
    }),
  });
  return { sent: true };
}

export async function confirmSubscription(token) {
  const sub = await Subscriber.findOne({ confirmTokenHash: hashToken(token) });
  if (!sub) throw new AppError('This confirmation link is invalid or has already been used', 400);
  sub.monitors = sub.pendingMonitors;
  sub.pendingMonitors = [];
  sub.confirmTokenHash = undefined;
  sub.confirmed = true;
  sub.confirmedAt = new Date();
  await sub.save();
  const monitors = await Monitor.find({ _id: { $in: sub.monitors } }, 'name environment').lean();
  return { email: sub.email, all: monitors.length === 0, monitors: monitors.map((m) => `${m.name} (${m.environment})`) };
}

export async function unsubscribe(token) {
  const sub = await Subscriber.findOneAndDelete({ unsubscribeToken: String(token) });
  if (!sub) throw new AppError('This unsubscribe link is invalid or was already used', 400);
  return { email: sub.email };
}

// Runs `fn` over items, at most `limit` at a time.
async function inBatches(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.allSettled(items.slice(i, i + limit).map(fn))));
  }
  return results;
}

/**
 * Emails confirmed visitors about an outage (type 'down') or its end ('resolved') of a public monitor.
 * Recovery emails only go out if the outage email did, so nobody gets a "resolved" out of nowhere.
 */
export async function notifySubscribers({ monitor, incident, type }, logger = console) {
  if (!env.subscriptionsEnabled || !monitor.isPublic || incident.alertsSuppressed) return 0;
  if (type === 'resolved' && !incident.subscribersNotifiedAt) return 0;

  const subscribers = await Subscriber.find(
    { confirmed: true, $or: [{ monitors: { $size: 0 } }, { monitors: monitor._id }] },
    'email unsubscribeToken'
  ).lean();
  if (!subscribers.length) return 0;

  const results = await inBatches(subscribers, SEND_CONCURRENCY, (s) =>
    sendMail({
      to: s.email,
      ...visitorIncidentEmail({
        monitor,
        incident,
        type,
        appUrl: env.appUrl,
        unsubscribeUrl: `${env.appUrl}/unsubscribe?token=${s.unsubscribeToken}`,
      }),
    })
  );
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - sent;
  if (type === 'down') await Incident.updateOne({ _id: incident._id }, { $set: { subscribersNotifiedAt: new Date() } });
  logger.log(`[subscribers] ${type} email for ${monitor.name}: ${sent} sent${failed ? `, ${failed} failed (${describeMailError(results.find((r) => r.status === 'rejected').reason)})` : ''}`);
  return sent;
}

// Admin overview.
export async function subscriberStats() {
  const [confirmed, pending, list] = await Promise.all([
    Subscriber.countDocuments({ confirmed: true }),
    Subscriber.countDocuments({ confirmed: false }),
    Subscriber.find({ confirmed: true }, 'email monitors confirmedAt').sort({ confirmedAt: -1 }).limit(200).lean(),
  ]);
  return {
    confirmed,
    pending,
    subscribers: list.map((s) => ({ email: s.email, services: s.monitors.length || 'all', confirmedAt: s.confirmedAt })),
  };
}
