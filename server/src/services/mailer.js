import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Sent emails when MAIL_TRANSPORT=memory (used by tests).
export const outbox = [];

let transporter = null;

// Splits "Name <email@x.io>" into { name, email }.
export function parseAddress(value) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value || '');
  return m ? { name: m[1].replace(/^"|"$/g, ''), email: m[2] } : { name: '', email: (value || '').trim() };
}

// Sends through an HTTPS email API — works on hosts that block SMTP ports (e.g. Render free).
function httpTransport(name, send) {
  return {
    async sendMail(msg) {
      const res = await send(msg);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${name} API ${res.status}: ${body.slice(0, 300)}`);
      }
      return { messageId: `${name}-${Date.now()}` };
    },
  };
}

function brevoTransport() {
  return httpTransport('Brevo', (msg) => {
    const from = parseAddress(msg.from);
    return fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: from.name || 'ZOps', email: from.email },
        to: [].concat(msg.to).map((email) => ({ email })),
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
      }),
      signal: AbortSignal.timeout(15000),
    });
  });
}

function resendTransport() {
  return httpTransport('Resend', (msg) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: msg.from, to: [].concat(msg.to), subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(15000),
    })
  );
}

function createTransporter() {
  if (env.mailTransport === 'brevo') return brevoTransport();
  if (env.mailTransport === 'resend') return resendTransport();
  if (env.mailTransport === 'smtp') {
    const { host, port, secure, user, pass } = env.smtp;
    return nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
  }
  if (env.mailTransport === 'memory') {
    return { sendMail: async (msg) => { outbox.push(msg); return { messageId: `memory-${outbox.length}` }; } };
  }
  // 'log': print instead of sending — handy when no mail server is set up yet.
  return {
    sendMail: async (msg) => {
      const to = [].concat(msg.to).join(', ');
      console.log(`[mail] To: ${to}\n[mail] Subject: ${msg.subject}\n${msg.text.replace(/^/gm, '[mail]   ')}`);
      return { messageId: 'logged' };
    },
  };
}

export async function sendMail({ to, subject, text, html }) {
  transporter ??= createTransporter();
  return transporter.sendMail({ from: env.alertFrom, to, subject, text, html });
}

// Human-readable description for logs and the API.
export function describeMailer() {
  if (env.mailTransport === 'smtp') return `SMTP ${env.smtp.host}:${env.smtp.port}`;
  if (env.mailTransport === 'brevo') return 'Brevo API';
  if (env.mailTransport === 'resend') return 'Resend API';
  return env.mailTransport;
}

// Checks the SMTP connection at startup so misconfiguration shows up early (doesn't throw).
export async function verifyMailer(logger = console) {
  transporter ??= createTransporter();
  if (typeof transporter.verify !== 'function') {
    logger.log(`[mail] transport: ${describeMailer()}`);
    return true;
  }
  try {
    await transporter.verify();
    logger.log(`[mail] connected to ${describeMailer()}`);
    return true;
  } catch (err) {
    logger.error(`[mail] cannot reach ${describeMailer()}: ${err.message} (alerts will fail until this is fixed)`);
    return false;
  }
}

// Some network errors (e.g. "localhost" resolving to both IPv4 and IPv6) arrive as an
// AggregateError with an empty message, so dig out something readable.
export function describeMailError(err) {
  const inner = err?.errors?.map((e) => e.message || e.code).filter(Boolean).join('; ');
  return err?.message || inner || err?.code || 'unknown error';
}
