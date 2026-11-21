import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { Monitor } from '../models/Monitor.js';
import { Report, REPORT_CATEGORIES } from '../models/Report.js';
import { AppError } from '../utils/AppError.js';
import { monitorEvents } from './events.js';

const MINUTE = 60_000;
const BASELINE_HOURS = 24;

export const hashIp = (ip) =>
  crypto.createHash('sha256').update(`${ip}|${env.jwtSecret}`).digest('hex').slice(0, 32);

/**
 * Is this monitor getting unusually many reports?
 * Compares the last REPORT_WINDOW_MINUTES with the average per window over the previous 24 hours.
 * Flagged when recent >= max(REPORT_MIN_COUNT, ceil(baseline x REPORT_SPIKE_FACTOR)).
 * Pure function: easy to unit test.
 */
export function isSpike({ recent, previous24h }, opts = env) {
  const windowsPerBaseline = (BASELINE_HOURS * 60) / opts.reportWindowMinutes;
  const baseline = previous24h / windowsPerBaseline;
  const threshold = Math.max(opts.reportMinCount, Math.ceil(baseline * opts.reportSpikeFactor));
  return { elevated: recent >= threshold, threshold, baseline: Math.round(baseline * 100) / 100 };
}

// Report counts by category, most common first, since `since`.
export async function categoryBreakdown(monitorId, since) {
  const rows = await Report.aggregate([
    { $match: { monitor: monitorId, createdAt: { $gte: since } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((r) => ({ category: r._id, count: r.count }));
}

/**
 * Recounts a monitor's recent reports, stores the count and flips reportStatus when needed.
 * The status flip is a compare-and-set, so with several API replicas only one emits the change.
 */
export async function evaluateReports(monitorId) {
  const now = Date.now();
  const windowStart = new Date(now - env.reportWindowMinutes * MINUTE);
  const baselineStart = new Date(windowStart.getTime() - BASELINE_HOURS * 60 * MINUTE);

  const [recent, previous24h, monitor] = await Promise.all([
    Report.countDocuments({ monitor: monitorId, createdAt: { $gte: windowStart } }),
    Report.countDocuments({ monitor: monitorId, createdAt: { $gte: baselineStart, $lt: windowStart } }),
    Monitor.findById(monitorId).lean(),
  ]);
  if (!monitor) return null;

  const spike = isSpike({ recent, previous24h });
  const previousStatus = monitor.reportStatus ?? 'normal';
  const nextStatus = spike.elevated ? 'elevated' : 'normal';
  const changed = nextStatus !== previousStatus;

  const update = { reportsRecent: recent };
  if (changed) Object.assign(update, { reportStatus: nextStatus, reportsChangedAt: new Date() });

  const filter = { _id: monitorId };
  if (changed) filter.reportStatus = previousStatus;
  const updated = await Monitor.findOneAndUpdate(filter, { $set: update }, { returnDocument: 'after' }).lean();
  if (!updated) return null; // another process already flipped it

  monitorEvents.emit('monitor-updated', { monitor: updated });
  if (changed) {
    const categories = await categoryBreakdown(monitor._id, windowStart);
    monitorEvents.emit('reports-change', {
      monitor: updated,
      from: previousStatus,
      to: nextStatus,
      recent,
      threshold: spike.threshold,
      categories,
    });
  }
  return { monitor: updated, recent, ...spike, changed };
}

// A visitor clicked "I have a problem".
export async function submitReport({ monitorId, category, ip }) {
  const monitor = await Monitor.findById(monitorId).lean();
  if (!monitor || !monitor.isPublic) throw new AppError('Monitor not found', 404);
  if (!REPORT_CATEGORIES.includes(category)) throw new AppError('Unknown problem type', 400);

  const ipHash = hashIp(ip);
  const since = new Date(Date.now() - env.reportCooldownMinutes * MINUTE);
  if (await Report.exists({ monitor: monitor._id, ipHash, createdAt: { $gte: since } })) {
    throw new AppError('Thanks, you already reported a problem with this service recently', 429);
  }

  await Report.create({ monitor: monitor._id, category, ipHash });
  return evaluateReports(monitor._id);
}

// Lets elevated monitors return to normal once the reports stop (nothing else would re-evaluate them).
// Runs every minute from startAlerting().
export async function sweepReportStatuses() {
  // Also recount monitors with a stale non-zero count so the number shown decays to 0.
  const active = await Monitor.find({ $or: [{ reportStatus: 'elevated' }, { reportsRecent: { $gt: 0 } }] }, '_id').lean();
  for (const m of active) await evaluateReports(m._id);
  return active.length;
}
