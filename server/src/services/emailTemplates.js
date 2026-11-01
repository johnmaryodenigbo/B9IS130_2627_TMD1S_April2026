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
