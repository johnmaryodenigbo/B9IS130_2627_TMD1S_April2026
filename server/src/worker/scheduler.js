import { Monitor } from '../models/Monitor.js';
import { runCheck } from '../services/checkRunner.js';
import { monitorEvents } from '../services/events.js';


export function createScheduler({ tickMs = 5000, concurrency = 10, logger = console } = {}) {
  let timer = null;
  let stopped = true;
  let ticking = false;
  let currentTick = Promise.resolve();
  const inFlight = new Set();

  const logStatusChange = ({ monitor, from, to, check }) => {
    const detail = check.error ? ` — ${check.error}` : ` (${check.statusCode}, ${check.responseTimeMs} ms)`;
    logger.log(`[worker] ${monitor.name} [${monitor.environment}] ${from} → ${to.toUpperCase()}${detail}`);
  };

  async function claimNext() {
    const now = new Date();
    // Native driver call so we can use an update pipeline: nextCheckAt = now + intervalSeconds.
    return Monitor.collection.findOneAndUpdate(
      { isActive: true, $or: [{ nextCheckAt: { $lte: now } }, { nextCheckAt: null }] },
      [{ $set: { nextCheckAt: { $add: [now, { $multiply: ['$intervalSeconds', 1000] }] } } }],
      { sort: { nextCheckAt: 1 }, returnDocument: 'before' }
    );
  }

  async function tick() {
    if (ticking || stopped) return;
    ticking = true;
    try {
      while (!stopped && inFlight.size < concurrency) {
        const doc = await claimNext();
        if (!doc) break; // nothing due

        const job = runCheck(Monitor.hydrate(doc))
          .catch((err) => logger.error(`[worker] check failed for ${doc.name}: ${err.message}`))
          .finally(() => inFlight.delete(job));
        inFlight.add(job);
      }
    } catch (err) {
      logger.error(`[worker] tick failed: ${err.message}`);
    } finally {
      ticking = false;
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      monitorEvents.on('status-change', logStatusChange);
      timer = setInterval(() => { if (!ticking) currentTick = tick(); }, tickMs);
      currentTick = tick();
      logger.log(`[worker] started (every ${tickMs / 1000}s, up to ${concurrency} checks at once)`);
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      monitorEvents.off('status-change', logStatusChange);
      await currentTick;
      await Promise.allSettled([...inFlight]); // let running checks finish
      logger.log('[worker] stopped');
    },
    tick, // exposed for tests
    // Resolves when the current tick has claimed its monitors and those checks have finished.
    async idle() {
      await currentTick;
      await Promise.allSettled([...inFlight]);
    },
    get running() { return !stopped; },
    get inFlight() { return inFlight.size; },
  };
}
