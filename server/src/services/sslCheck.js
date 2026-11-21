import tls from 'node:tls';
import net from 'node:net';

const DAY = 24 * 60 * 60 * 1000;

const nameOf = (dn) => (dn ? dn.O || dn.CN || Object.values(dn)[0] : undefined);

/**
 * Opens a TLS connection to an https URL and reads its certificate.
 * Never throws. Returns null for non-https URLs.
 * @returns {Promise<null | { validTo?: Date, validFrom?: Date, daysRemaining?: number,
 *   issuer?: string, subject?: string, trusted?: boolean, error?: string }>}
 */
export function checkCertificate(url, { timeoutMs = 10000 } = {}) {
  let target;
  try {
    target = new URL(url);
  } catch {
    return Promise.resolve(null);
  }
  if (target.protocol !== 'https:') return Promise.resolve(null);

  const host = target.hostname.replace(/^\[|\]$/g, '');
  const port = Number(target.port) || 443;

  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    // rejectUnauthorized: false so we can still read (and report) self-signed or expired certificates.
    const socket = tls.connect({
      host,
      port,
      servername: net.isIP(host) ? undefined : host,
      rejectUnauthorized: false,
    });

    socket.setTimeout(timeoutMs, () => finish({ error: `TLS connection timed out after ${timeoutMs / 1000}s` }));
    socket.once('error', (err) => finish({ error: err.code === 'ENOTFOUND' ? 'DNS lookup failed (host not found)' : err.message }));
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) return finish({ error: 'Server did not present a certificate' });
      const validTo = new Date(cert.valid_to);
      finish({
        validTo,
        validFrom: new Date(cert.valid_from),
        daysRemaining: Math.floor((validTo.getTime() - Date.now()) / DAY),
        issuer: nameOf(cert.issuer),
        subject: cert.subject?.CN || nameOf(cert.subject),
        trusted: socket.authorized,
        error: socket.authorized ? undefined : String(socket.authorizationError),
      });
    });
  });
}

/**
 * Which expiry email (if any) to send now. Pure function, easy to test.
 * thresholds: e.g. [30, 14, 7, 3, 1] (days). lastAlerted: threshold already emailed (0 = "expired"), or null.
 * Returns { alertAt: number|null, reset: boolean }:
 *   alertAt = threshold to email about now (0 = expired), reset = certificate was renewed, forget old alerts.
 */
export function nextSslAlert(daysRemaining, lastAlerted, thresholds) {
  if (daysRemaining == null || !thresholds.length) return { alertAt: null, reset: false };
  if (daysRemaining > thresholds[0]) return { alertAt: null, reset: lastAlerted != null };
  if (daysRemaining < 0) return { alertAt: lastAlerted === 0 ? null : 0, reset: false };
  // smallest threshold that has been reached
  const reached = thresholds.filter((t) => daysRemaining <= t).at(-1);
  if (lastAlerted == null || reached < lastAlerted) return { alertAt: reached, reset: false };
  return { alertAt: null, reset: false };
}
