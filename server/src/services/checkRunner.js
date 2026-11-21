import { Check } from '../models/Check.js';
import { Monitor } from '../models/Monitor.js';
import { env } from '../config/env.js';
import { performCheck } from './checker.js';
import { checkCertificate, nextSslAlert } from './sslCheck.js';
import { nextState } from './statusRules.js';
import { monitorEvents } from './events.js';

// Is the stored certificate info older than SSL_CHECK_HOURS?
const sslDue = (monitor) =>
  monitor.url?.startsWith('https://') &&
  (!monitor.sslCheckedAt || Date.now() - new Date(monitor.sslCheckedAt).getTime() > env.sslCheckHours * 3600_000);

// Reads the certificate and works out whether an expiry email is due. Returns fields to $set.
async function sslUpdate(monitor) {
  const cert = await checkCertificate(monitor.url, { timeoutMs: monitor.timeoutMs });
  if (!cert) return { fields: {}, alertAt: null };
  const fields = {
    sslCheckedAt: new Date(),
    sslValidTo: cert.validTo ?? null,
    sslValidFrom: cert.validFrom ?? null,
    sslDaysRemaining: cert.daysRemaining ?? null,
    sslIssuer: cert.issuer ?? null,
    sslSubject: cert.subject ?? null,
    sslTrusted: cert.trusted ?? null,
    sslError: cert.error ?? null,
  };
  const { alertAt, reset } = nextSslAlert(cert.daysRemaining, monitor.sslAlertedDays ?? null, env.sslAlertDays);
  if (alertAt != null) fields.sslAlertedDays = alertAt;
  else if (reset) fields.sslAlertedDays = null;
  return { fields, alertAt };
}

// Runs one check for a monitor, stores the result and updates the monitor's status.
// For https monitors it also re-reads the SSL certificate every SSL_CHECK_HOURS (or when forceSsl).
// Returns { check, statusChanged }.
export async function runCheck(monitor, { forceSsl = false } = {}) {
  const wantSsl = monitor.url?.startsWith('https://') && (forceSsl || sslDue(monitor));
  const [result, ssl] = await Promise.all([
    performCheck(monitor),
    wantSsl ? sslUpdate(monitor) : Promise.resolve({ fields: {}, alertAt: null }),
  ]);
  const checkedAt = new Date();

  const check = await Check.create({ monitor: monitor._id, checkedAt, ...result });

  const next = nextState(monitor, result.ok, env.failureThreshold);
  const update = {
    lastCheckedAt: checkedAt,
    lastStatusCode: result.statusCode ?? null,
    lastResponseTimeMs: result.responseTimeMs,
    lastError: result.error ?? null,
    ...next,
    ...ssl.fields,
  };
  if (next.status !== monitor.status) update.statusChangedAt = checkedAt;

  // Only update if the monitor wasn't paused/deleted while the request was in flight.
  const before = await Monitor.findOneAndUpdate(
    { _id: monitor._id, isActive: true },
    { $set: update },
    { returnDocument: 'before' }
  ).lean();

  const statusChanged = Boolean(before) && before.status !== next.status;
  if (before) monitorEvents.emit('checked', { monitor: { ...before, ...update }, check: check.toJSON() });
  if (before && ssl.alertAt != null) {
    monitorEvents.emit('ssl-warning', { monitor: { ...before, ...update }, daysRemaining: update.sslDaysRemaining, threshold: ssl.alertAt });
  }
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
