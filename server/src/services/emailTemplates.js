// Email bodies for alerts

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 754000 -> "12 min 34 s", 7_380_000 -> "2 h 3 min"
export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

const formatTime = (d) => new Date(d).toUTCString();

function layout({ color, heading, rows, appUrl, footer }) {
  const tableRows = rows
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2330;margin:0;padding:24px;background:#f6f7f9">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3e6eb;border-radius:10px;overflow:hidden">
<div style="background:${color};color:#fff;padding:16px 20px;font-size:18px;font-weight:600">${escapeHtml(heading)}</div>
<div style="padding:16px 20px"><table style="border-collapse:collapse;font-size:14px">${tableRows}</table>
<p style="margin:20px 0 0"><a href="${escapeHtml(appUrl)}/on-call" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Open ZOps</a></p>
<p style="color:#6b7280;font-size:12px;margin-top:20px">${escapeHtml(footer)}</p></div></div></body></html>`;
}

const textBody = (heading, rows, appUrl, footer) =>
  [heading, '', ...rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`), '', `Open ZOps: ${appUrl}/on-call`, '', footer].join('\n');

export function downEmail({ monitor, incident, check, appUrl, reminder = false }) {
  const label = `${monitor.name} (${monitor.environment})`;
  const downFor = formatDuration(Date.now() - new Date(incident.startedAt).getTime());
  const heading = reminder ? `STILL DOWN: ${label} — ${downFor}` : `DOWN: ${label}`;
  const rows = [
    ['Monitor', monitor.name],
    ['Environment', monitor.environment],
    ['URL', `${monitor.method || 'GET'} ${monitor.url}`],
    ['Error', check?.error ?? monitor.lastError ?? incident.cause],
    ['Status code', check?.statusCode ?? monitor.lastStatusCode],
    ['Down since', formatTime(incident.startedAt)],
    reminder ? ['Down for', downFor] : null,
  ].filter(Boolean);
  const footer = reminder
    ? 'This reminder repeats until someone acknowledges the incident in ZOps.'
    : 'You are receiving this because you are on call in ZOps.';
  return {
    subject: `[ZOps] ${heading}`,
    text: textBody(heading, rows, appUrl, footer),
    html: layout({ color: '#dc2626', heading, rows, appUrl, footer }),
  };
}

export function recoveredEmail({ monitor, incident, appUrl }) {
  const label = `${monitor.name} (${monitor.environment})`;
  const duration = formatDuration(new Date(incident.resolvedAt).getTime() - new Date(incident.startedAt).getTime());
  const heading = `RECOVERED: ${label} after ${duration}`;
  const rows = [
    ['Monitor', monitor.name],
    ['Environment', monitor.environment],
    ['URL', `${monitor.method || 'GET'} ${monitor.url}`],
    ['Down since', formatTime(incident.startedAt)],
    ['Recovered at', formatTime(incident.resolvedAt)],
    ['Total downtime', duration],
    ['Cause', incident.cause],
    ['Acknowledged by', incident.acknowledgedBy?.name],
  ];
  const footer = 'You are receiving this because you are on call in ZOps.';
  return {
    subject: `[ZOps] ${heading}`,
    text: textBody(heading, rows, appUrl, footer),
    html: layout({ color: '#16a34a', heading, rows, appUrl, footer }),
  };
}

const CATEGORY_LABELS = { down: 'Not loading / down', slow: 'Slow', login: 'Can\'t log in', errors: 'Errors', other: 'Other' };
export const categoryLabel = (c) => CATEGORY_LABELS[c] || c;

export function reportsEmail({ monitor, recent, windowMinutes, categories = [], appUrl }) {
  const label = `${monitor.name} (${monitor.environment})`;
  const heading = `USERS REPORTING ISSUES: ${label}`;
  const breakdown = categories.map((c) => `${categoryLabel(c.category)} ${c.count}`).join(', ');
  const rows = [
    ['Monitor', monitor.name],
    ['Environment', monitor.environment],
    ['URL', `${monitor.method || 'GET'} ${monitor.url}`],
    ['Reports', `${recent} in the last ${windowMinutes} min`],
    ['What users say', breakdown],
    ['Automated checks', monitor.status === 'up' ? 'Passing (users may see something the checks miss)' : monitor.status],
  ];
  const footer = 'Visitors of the public status page reported problems well above the usual level.';
  return {
    subject: `[ZOps] ${heading}`,
    text: textBody(heading, rows, appUrl, footer),
    html: layout({ color: '#d97706', heading, rows, appUrl, footer }),
  };
}

export function sslEmail({ monitor, daysRemaining, appUrl }) {
  const label = `${monitor.name} (${monitor.environment})`;
  const expired = daysRemaining < 0;
  const heading = expired
    ? `SSL CERTIFICATE EXPIRED: ${label}`
    : `SSL certificate expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}: ${label}`;
  const rows = [
    ['Monitor', monitor.name],
    ['Environment', monitor.environment],
    ['URL', monitor.url],
    ['Expires', monitor.sslValidTo ? formatTime(monitor.sslValidTo) : ''],
    ['Certificate for', monitor.sslSubject],
    ['Issued by', monitor.sslIssuer],
    ['Problem', monitor.sslError],
  ];
  const footer = expired
    ? 'Browsers now show a security warning for this site. Renew the certificate as soon as possible.'
    : 'Renew the certificate (e.g. certbot renew) before it expires to avoid browser security warnings.';
  return {
    subject: `[ZOps] ${heading}`,
    text: textBody(heading, rows, appUrl, footer),
    html: layout({ color: expired ? '#dc2626' : '#d97706', heading, rows, appUrl, footer }),
  };
}

// ---------- Emails to visitors (public wording: no URLs or error details) ----------

function visitorLayout({ color, heading, paragraphs, buttonText, buttonUrl, unsubscribeUrl }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join('');
  const unsubscribe = unsubscribeUrl
    ? `<p style="color:#6b7280;font-size:12px;margin-top:20px">You get these emails because you subscribed to ZOps status updates. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2330;margin:0;padding:24px;background:#f6f7f9">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3e6eb;border-radius:10px;overflow:hidden">
<div style="background:${color};color:#fff;padding:16px 20px;font-size:18px;font-weight:600">${escapeHtml(heading)}</div>
<div style="padding:16px 20px;font-size:14px">${body}
<p style="margin:20px 0 0"><a href="${escapeHtml(buttonUrl)}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(buttonText)}</a></p>
${unsubscribe}</div></div></body></html>`;
}

export function subscribeConfirmEmail({ monitorNames = [], confirmUrl, appUrl }) {
  const what = monitorNames.length ? monitorNames.join(', ') : 'all services';
  const heading = 'Confirm your ZOps status updates';
  const paragraphs = [
    `Someone (hopefully you) asked to be emailed when there is an outage on: ${what}.`,
    'Click the button to confirm. If this wasn\'t you, ignore this email and nothing will happen.',
  ];
  return {
    subject: '[ZOps] Confirm your status updates',
    text: [heading, '', ...paragraphs, '', `Confirm: ${confirmUrl}`, '', `Status page: ${appUrl}`].join('\n'),
    html: visitorLayout({ color: '#2563eb', heading, paragraphs, buttonText: 'Confirm subscription', buttonUrl: confirmUrl }),
  };
}

export function visitorIncidentEmail({ monitor, incident, type, appUrl, unsubscribeUrl }) {
  const label = `${monitor.name} (${monitor.environment})`;
  const resolved = type === 'resolved';
  const heading = resolved ? `Resolved: ${label}` : `Outage: ${label}`;
  const paragraphs = resolved
    ? [`${label} is working again.`, `The outage started at ${formatTime(incident.startedAt)} and lasted ${formatDuration(new Date(incident.resolvedAt).getTime() - new Date(incident.startedAt).getTime())}.`]
    : [`${label} is currently not working as expected. Our team has been alerted and is looking into it.`, `Started: ${formatTime(incident.startedAt)}`, 'We will email you again when it is resolved.'];
  return {
    subject: `[ZOps status] ${heading}`,
    text: [heading, '', ...paragraphs, '', `Status page: ${appUrl}`, '', `Unsubscribe: ${unsubscribeUrl}`].join('\n'),
    html: visitorLayout({ color: resolved ? '#16a34a' : '#dc2626', heading, paragraphs, buttonText: 'View status page', buttonUrl: appUrl, unsubscribeUrl }),
  };
}

export function testEmail({ user, appUrl }) {
  const heading = 'ZOps test email';
  const rows = [['Sent to', `${user.name} <${user.email}>`], ['Time', formatTime(new Date())]];
  const footer = 'If you can read this, ZOps can deliver alert emails to you.';
  return {
    subject: '[ZOps] Test email',
    text: textBody(heading, rows, appUrl, footer),
    html: layout({ color: '#2563eb', heading, rows, appUrl, footer }),
  };
}
