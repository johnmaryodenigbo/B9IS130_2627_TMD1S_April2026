import { Check } from '../models/Check.js';
import { Monitor } from '../models/Monitor.js';
import { env } from '../config/env.js';
import { performCheck } from './checker.js';
import { nextState } from './statusRules.js';
import { monitorEvents } from './events.js';

// Runs one check for a monitor, stores the result and updates the monitor's status.
// Returns { check, statusChanged }.
export async function runCheck(monitor) {
  const result = await performCheck(monitor);
  const checkedAt = new Date();

  const check = await Check.create({ monitor: monitor._id, checkedAt, ...result });

  const next = nextState(monitor, result.ok, env.failureThreshold);
  const update = {
    lastCheckedAt: checkedAt,
    lastStatusCode: result.statusCode ?? null,
    lastResponseTimeMs: result.responseTimeMs,
    lastError: result.error ?? null,
    ...next,
  };
  if (next.status !== monitor.status) update.statusChangedAt = checkedAt;

  // Only update if the monitor wasn't paused/deleted while the request was in flight.
  const before = await Monitor.findOneAndUpdate(
    { _id: monitor._id, isActive: true },
    { $set: update },
    { returnDocument: 'before' }
  ).lean();

  const statusChanged = Boolean(before) && before.status !== next.status;
  if (statusChanged) {
    monitorEvents.emit('status-change', {
      monitor: { ...before, ...update },
      from: before.status,
      to: next.status,
      check: check.toJSON(),
    });
  }

  return { check, statusChanged };
}
