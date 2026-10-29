import { Monitor } from '../models/Monitor.js';
import { monitorEvents } from '../services/events.js';

/**
 * Only used when the worker runs in a separate process (WORKER_ENABLED=false).
 * The worker's events can't reach this process, so we poll MongoDB for monitors whose
 * `updatedAt` changed and re-emit them for the live dashboard.
 *
 * Status changes are re-emitted as 'status-change:relayed' (not 'status-change'), so
 * anything that must run exactly once per change (email alerts) stays in the worker process.
 */
export function startChangeRelay({ intervalMs = 3000, logger = console } = {}) {
  const knownStatus = new Map();
  let since = new Date();
  let timer = null;
  let busy = false;

  async function seed() {
    const all = await Monitor.find({}, 'status updatedAt').lean();
    for (const m of all) knownStatus.set(String(m._id), m.status);
  }

  async function poll() {
    if (busy) return;
    busy = true;
    try {
      const changed = await Monitor.find({ updatedAt: { $gt: since } }).sort({ updatedAt: 1 }).lean();
      for (const m of changed) {
        const id = String(m._id);
        const from = knownStatus.get(id);
        monitorEvents.emit('checked', { monitor: m });
        if (from && from !== m.status && (m.status === 'up' || m.status === 'down')) {
          monitorEvents.emit('status-change:relayed', { monitor: m, from, to: m.status });
        }
        knownStatus.set(id, m.status);
        since = m.updatedAt;
      }
    } catch (err) {
      logger.error(`[realtime] change relay failed: ${err.message}`);
    } finally {
      busy = false;
    }
  }

  seed().catch((err) => logger.error(`[realtime] change relay seed failed: ${err.message}`));
  timer = setInterval(poll, intervalMs);
  logger.log(`[realtime] worker runs separately: relaying monitor changes every ${intervalMs / 1000}s`);

  return { stop: () => clearInterval(timer), poll };
}
