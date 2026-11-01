import { Incident } from '../models/Incident.js';
import { AppError } from '../utils/AppError.js';
import { monitorEvents } from '../services/events.js';
import { sendMail, describeMailer, describeMailError } from '../services/mailer.js';
import { testEmail } from '../services/emailTemplates.js';
import { getAlertRecipients } from '../services/alerts.js';
import { env } from '../config/env.js';

const DAY = 24 * 60 * 60 * 1000;

// GET /api/incidents?status=open&monitor=<id>&limit=50
export async function listIncidents(req, res) {
  const { status, monitor } = req.query;
  const filter = {};
  if (status === 'open' || status === 'resolved') filter.status = status;
  if (monitor) filter.monitor = monitor;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const incidents = await Incident.find(filter).sort({ startedAt: -1 }).limit(limit);
  res.json({ incidents });
}

// POST /api/incidents/:id/acknowledge — "I'm on it": stops reminder emails.
export async function acknowledgeIncident(req, res) {
  const incident = await Incident.findById(req.params.id);
  if (!incident) throw new AppError('Incident not found', 404);
  if (incident.status !== 'open') throw new AppError('Incident is already resolved', 400);
  if (!incident.acknowledgedAt) {
    incident.acknowledgedAt = new Date();
    incident.acknowledgedBy = { id: req.user.id, name: req.user.name };
    await incident.save();
    monitorEvents.emit('incident-changed', { incident: incident.toJSON() });
  }
  res.json({ incident });
}

// GET /api/public/incidents?days=14 — recent outages of public monitors (no error details).
export async function listPublicIncidents(req, res) {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  const incidents = await Incident.find({ isPublic: true, startedAt: { $gte: new Date(Date.now() - days * DAY) } })
    .sort({ startedAt: -1 })
    .limit(50);
  res.json({
    incidents: incidents.map((i) => ({
      id: i.id,
      monitorName: i.monitorName,
      environment: i.environment,
      status: i.status,
      startedAt: i.startedAt,
      resolvedAt: i.resolvedAt ?? null,
      durationMs: i.durationMs,
    })),
  });
}

// POST /api/alerts/test — send a test email to yourself.
export async function sendTestEmail(req, res) {
  try {
    await sendMail({ to: req.user.email, ...testEmail({ user: req.user, appUrl: env.appUrl }) });
    res.json({ ok: true, to: req.user.email, transport: describeMailer() });
  } catch (err) {
    throw new AppError(`Could not send email via ${describeMailer()}: ${describeMailError(err)}`, 502);
  }
}

// GET /api/alerts/recipients — who would be emailed if something went down now.
export async function alertRecipients(_req, res) {
  res.json({ ...(await getAlertRecipients()), transport: describeMailer() });
}
