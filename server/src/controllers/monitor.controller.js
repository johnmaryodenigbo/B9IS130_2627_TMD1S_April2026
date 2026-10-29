import { Monitor } from '../models/Monitor.js';
import { AppError } from '../utils/AppError.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function findMonitorOr404(id) {
  const monitor = await Monitor.findById(id);
  if (!monitor) throw new AppError('Monitor not found', 404);
  return monitor;
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
  res.json({ monitors });
}

export async function getMonitor(req, res) {
  res.json({ monitor: await findMonitorOr404(req.params.id) });
}

export async function createMonitor(req, res) {
  const data = { ...req.body, createdBy: req.user.id, updatedBy: req.user.id };
  if (data.isActive === false) data.status = 'paused';
  const monitor = await Monitor.create(data);
  res.status(201).json({ monitor });
}

export async function updateMonitor(req, res) {
  const monitor = await findMonitorOr404(req.params.id);
  const wasActive = monitor.isActive;

  monitor.set(req.body);
  monitor.updatedBy = req.user.id;

  // Pausing/resuming changes the status; changing what we check means old results no longer apply.
  const targetChanged = ['url', 'method', 'expectedStatus'].some((f) => monitor.isModified(f));
  if (!monitor.isActive) monitor.status = 'paused';
  else if (!wasActive || targetChanged) monitor.status = 'pending';

  await monitor.save();
  res.json({ monitor });
}

export async function deleteMonitor(req, res) {
  const monitor = await findMonitorOr404(req.params.id);
  await monitor.deleteOne();
  res.status(204).end();
}

// GET /api/public/monitors — anonymous dashboard. Never exposes URLs or internal settings.
export async function listPublicMonitors(_req, res) {
  const monitors = await Monitor.find({ isPublic: true }).sort({ environment: 1, name: 1 }).lean();
  res.json({
    monitors: monitors.map((m) => ({
      id: m._id.toString(),
      name: m.name,
      description: m.description,
      environment: m.environment,
      status: m.status,
      lastCheckedAt: m.lastCheckedAt ?? null,
      lastResponseTimeMs: m.lastResponseTimeMs ?? null,
    })),
  });
}
