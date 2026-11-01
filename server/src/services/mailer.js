import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Sent emails when MAIL_TRANSPORT=memory (used by tests).
export const outbox = [];

let transporter = null;

function createTransporter() {
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
  return env.mailTransport === 'smtp' ? `SMTP ${env.smtp.host}:${env.smtp.port}` : env.mailTransport;
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
