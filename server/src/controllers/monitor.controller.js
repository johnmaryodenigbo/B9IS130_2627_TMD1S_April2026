import { Monitor } from '../models/Monitor.js';
import { Check } from '../models/Check.js';
import { AppError } from '../utils/AppError.js';
import { runCheck } from '../services/checkRunner.js';
import { getUptimeStats, getDailyHistory, EMPTY_UPTIME } from '../services/uptime.js';
import { monitorEvents } from '../services/events.js';
import { toPublicView } from '../services/monitorViews.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function findMonitorOr404(id) {
  const monitor = await Monitor.findById(id);
  if (!monitor) throw new AppError('Monitor not found', 404);
  return monitor;
}

// Adds uptime % (24h / 7d / 30d) to each monitor.
async function withUptime(monitors) {
  const stats = await getUptimeStats(monitors.map((m) => m._id));
  return monitors.map((m) => ({ ...m.toJSON(), uptime: stats.get(m.id) ?? EMPTY_UPTIME }));
}

// GET /api/monitors?environment=production&status=down&active=true&q=pay
export async function listMonitors(req, res) {
  const { environment, status, active, q } = req.query;
  const filter = {};
  if (environment) filter.environment = environment;
  if (status) filter.status = status;
  if (active === 'true' || active === 'false') filter.isActive = active === 'true';
  if (q) filter.name = { $regex: escapeRegex(String(q)), $options: 'i' };

  const monitors = await Monitor.find(filter)
    .sort({ environment: 1, name: 1 })
    .populate('createdBy', 'name email');
  res.json({ monitors: await withUptime(monitors) });
}

export async function getMonitor(req, res) {
  const [monitor] = await withUptime([await findMonitorOr404(req.params.id)]);
  res.json({ monitor });
}

export async function createMonitor(req, res) {
  const data = { ...req.body, createdBy: req.user.id, updatedBy: req.user.id, nextCheckAt: new Date() };
  if (data.isActive === false) data.status = 'paused';
  const monitor = await Monitor.create(data);
  monitorEvents.emit('monitor-saved', { monitor: monitor.toObject() });
  res.status(201).json({ monitor });
}

export async function updateMonitor(req, res) {
  const monitor = await findMonitorOr404(req.params.id);
  const wasActive = monitor.isActive;
  const previousStatus = monitor.status;

  monitor.set(req.body);
  monitor.updatedBy = req.user.id;

  // Pausing/resuming changes the status; changing what we check means old results no longer apply.
  const targetChanged = ['url', 'method', 'expectedStatus'].some((f) => monitor.isModified(f));
  if (!monitor.isActive) {
    monitor.status = 'paused';
  } else if (!wasActive || targetChanged) {
    monitor.status = 'pending';
    monitor.consecutiveFailures = 0;
  }
  if (monitor.status !== previousStatus) monitor.statusChangedAt = new Date();

  // Check again straight away when it was resumed or what/how often we check changed.
  if (monitor.isActive && (!wasActive || targetChanged || monitor.isModified('intervalSeconds'))) {
    monitor.nextCheckAt = new Date();
  }

  await monitor.save();
  monitorEvents.emit('monitor-saved', { monitor: monitor.toObject() });
  res.json({ monitor });
}

export async function deleteMonitor(req, res) {
  const monitor = await findMonitorOr404(req.params.id);
  await Promise.all([monitor.deleteOne(), Check.deleteMany({ monitor: monitor._id })]);
  monitorEvents.emit('monitor-deleted', { id: monitor.id, isPublic: monitor.isPublic });
  res.status(204).end();
}

// GET /api/monitors/:id/checks?limit=50 — latest check results, newest first.
export async function listChecks(req, res) {
  const monitor = await findMonitorOr404(req.params.id);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const checks = await Check.find({ monitor: monitor._id }).sort({ checkedAt: -1 }).limit(limit);
  res.json({ checks });
}

// POST /api/monitors/:id/check — run a check right now (e.g. an SRE verifying a fix).
export async function checkNow(req, res) {
  const monitor = await findMonitorOr404(req.params.id);
  if (!monitor.isActive) throw new AppError('Resume this monitor before checking it', 400);

  const { check } = await runCheck(monitor);
  const [updated] = await withUptime([await findMonitorOr404(monitor.id)]);
  res.json({ check, monitor: updated });
}

// GET /api/public/monitors — anonymous dashboard. Never exposes URLs or internal settings.
export async function listPublicMonitors(_req, res) {
  const monitors = await Monitor.find({ isPublic: true }).sort({ environment: 1, name: 1 }).lean();
  const ids = monitors.map((m) => m._id);
  const [stats, history] = await Promise.all([getUptimeStats(ids), getDailyHistory(ids, 30)]);

  res.json({
    monitors: monitors.map((m) => {
      const id = m._id.toString();
      return {
        ...toPublicView(m),
        uptime: stats.get(id) ?? EMPTY_UPTIME,
        history: history.get(id) ?? [],
      };
    }),
  });
}
