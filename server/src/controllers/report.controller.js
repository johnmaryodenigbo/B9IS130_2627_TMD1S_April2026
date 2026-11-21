import { Monitor } from '../models/Monitor.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { submitReport, categoryBreakdown } from '../services/reports.js';

// POST /api/public/monitors/:id/reports  { category } — "I have a problem" from a visitor.
export async function createReport(req, res) {
  const result = await submitReport({ monitorId: req.params.id, category: req.body.category, ip: req.ip });
  res.status(201).json({
    ok: true,
    reportStatus: result?.monitor.reportStatus ?? 'normal',
    reportsRecent: result?.recent ?? 0,
  });
}

// GET /api/monitors/:id/reports?hours=24 — what users reported (staff).
export async function reportSummary(req, res) {
  const monitor = await Monitor.findById(req.params.id).lean();
  if (!monitor) throw new AppError('Monitor not found', 404);
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 24 * 30);
  const since = new Date(Date.now() - hours * 3600_000);
  const categories = await categoryBreakdown(monitor._id, since);
  res.json({
    hours,
    total: categories.reduce((n, c) => n + c.count, 0),
    categories,
    reportStatus: monitor.reportStatus ?? 'normal',
    reportsRecent: monitor.reportsRecent ?? 0,
    windowMinutes: env.reportWindowMinutes,
  });
}
