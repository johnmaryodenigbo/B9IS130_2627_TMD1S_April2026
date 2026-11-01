import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Monitor } from '../models/Monitor.js';
import { Incident } from '../models/Incident.js';
import { monitorEvents } from './events.js';
import { sendMail, describeMailError } from './mailer.js';
import { downEmail, recoveredEmail } from './emailTemplates.js';

const MINUTE = 60_000;

// Tell the UI (realtime/socket.js) that an incident changed.
const emitIncident = (incident) => monitorEvents.emit('incident-changed', { incident: incident.toJSON() });

/**
 * Who gets alert emails: active SREs who are on call.
 * If nobody is on call, fall back to active admins so an outage is never silent.
 */
export async function getAlertRecipients() {
  const sres = await User.find({ role: 'sre', isActive: true, onCall: true }, 'email').lean();
  if (sres.length) return { recipients: sres.map((u) => u.email), fallback: false };
  const admins = await User.find({ role: 'admin', isActive: true }, 'email').lean();
  return { recipients: admins.map((u) => u.email), fallback: true };
}

// Sends one email for an incident and records the attempt on it (never throws).
async function notify(incident, type, message, logger) {
  const { recipients, fallback } = await getAlertRecipients();
  const entry = { type, sentAt: new Date(), recipients, ok: false };

  if (!recipients.length) {
    entry.error = 'Nobody to email: no active on-call SREs or admins';
  } else {
    try {
      await sendMail({ to: recipients, ...message });
      entry.ok = true;
      if (fallback) entry.error = 'No SRE on call, sent to admins instead';
    } catch (err) {
      entry.error = describeMailError(err);
    }
  }

  const level = entry.ok ? 'log' : 'error';
  logger[level](`[alerts] ${type} email for ${incident.monitorName}: ${entry.ok ? `sent to ${recipients.join(', ')}` : entry.error}`);

  const updated = await Incident.findByIdAndUpdate(
    incident._id,
    { $push: { notifications: entry }, $set: { lastNotifiedAt: entry.sentAt } },
    { returnDocument: 'after' }
  );
  if (updated) emitIncident(updated);
  return entry;
}

// Monitor went DOWN: open an incident and email the on-call SREs.
async function openIncident(monitor, check, logger) {
  // Flapping protection: if this monitor already had an incident within the cooldown, record it but stay quiet.
  const cooldownStart = new Date(Date.now() - env.alertCooldownMinutes * MINUTE);
  const recent = env.alertCooldownMinutes > 0
    && await Incident.exists({ monitor: monitor._id, startedAt: { $gte: cooldownStart } });

  let incident;
  try {
    incident = await Incident.create({
      monitor: monitor._id,
      monitorName: monitor.name,
      environment: monitor.environment,
      isPublic: monitor.isPublic,
      startedAt: monitor.statusChangedAt ?? new Date(),
      cause: check?.error ?? monitor.lastError,
      alertsSuppressed: Boolean(recent),
    });
  } catch (err) {
    if (err.code === 11000) return null; // already has an open incident
    throw err;
  }
  emitIncident(incident);

  if (incident.alertsSuppressed) {
    logger.log(`[alerts] ${monitor.name} is flapping (down again within ${env.alertCooldownMinutes} min): no email`);
  } else {
    await notify(incident, 'down', downEmail({ monitor, incident, check, appUrl: env.appUrl }), logger);
  }
  return incident;
}

// Close the open incident for a monitor. Emails "recovered" only when it really recovered
// and a DOWN email went out for it.
async function resolveIncident(monitor, resolution, logger) {
  const incident = await Incident.findOneAndUpdate(
    { monitor: monitor._id ?? monitor.id, status: 'open' },
    { $set: { status: 'resolved', resolvedAt: new Date(), resolution } },
    { returnDocument: 'after' }
  );
  if (!incident) return null;
  emitIncident(incident);

  const downWasEmailed = incident.notifications.some((n) => n.type === 'down');
  if (resolution === 'recovered' && downWasEmailed && !incident.alertsSuppressed) {
    await notify(incident, 'recovered', recoveredEmail({ monitor, incident, appUrl: env.appUrl }), logger);
  }
  return incident;
}

export async function handleStatusChange({ monitor, from, to, check }, logger = console) {
  if (to === 'down') return openIncident(monitor, check, logger);
  if (to === 'up' && from === 'down') return resolveIncident(monitor, 'recovered', logger);
  return null;
}

// An admin paused/edited a monitor that was down: close its incident quietly.
export async function handleMonitorSaved({ monitor }, logger = console) {
  if (monitor.status === 'down') return null;
  return resolveIncident(monitor, monitor.status === 'paused' ? 'paused' : 'reset', logger);
}

export async function handleMonitorDeleted({ id }, logger = console) {
  return resolveIncident({ id }, 'deleted', logger);
}

/**
 * Re-sends the DOWN email for incidents that are still open, unacknowledged and haven't been
 * emailed for ALERT_REMINDER_MINUTES. Each incident is claimed atomically, so several
 * processes can run this without sending duplicates.
 */
export async function sendDueReminders(logger = console) {
  if (!env.alertReminderMinutes) return 0;
  let sent = 0;
  for (;;) {
    const now = new Date();
    const incident = await Incident.findOneAndUpdate(
      {
        status: 'open',
        acknowledgedAt: null,
        alertsSuppressed: false,
        lastNotifiedAt: { $lte: new Date(now.getTime() - env.alertReminderMinutes * MINUTE) },
      },
      { $set: { lastNotifiedAt: now } },
      { returnDocument: 'after' }
    );
    if (!incident) return sent;

    const monitor = await Monitor.findById(incident.monitor).lean();
    if (!monitor) continue;
    await notify(incident, 'reminder', downEmail({ monitor, incident, appUrl: env.appUrl, reminder: true }), logger);
    sent += 1;
  }
}

/**
 * Starts listening for status changes. Call it in every process that runs checks
 * (the API, for "check now", and the worker). Reminders should run where the worker runs.
 */
export function startAlerting({ reminders = true, logger = console } = {}) {
  const safe = (fn) => (payload) => fn(payload, logger).catch((err) => logger.error(`[alerts] ${err.message}`));
  const onStatus = safe(handleStatusChange);
  const onSaved = safe(handleMonitorSaved);
  const onDeleted = safe(handleMonitorDeleted);

  monitorEvents.on('status-change', onStatus);
  monitorEvents.on('monitor-saved', onSaved);
  monitorEvents.on('monitor-deleted', onDeleted);

  const timer = reminders && env.alertReminderMinutes
    ? setInterval(() => sendDueReminders(logger).catch((err) => logger.error(`[alerts] reminders: ${err.message}`)), MINUTE)
    : null;

  return {
    stop() {
      monitorEvents.off('status-change', onStatus);
      monitorEvents.off('monitor-saved', onSaved);
      monitorEvents.off('monitor-deleted', onDeleted);
      clearInterval(timer);
    },
  };
}
