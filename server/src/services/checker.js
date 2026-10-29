// Performs one HTTP check. Pure network code: no database, easy to unit test.

const USER_AGENT = 'ZOps-Monitor/1.0 (+uptime check)';

// Turns low-level Node/undici errors into messages an SRE can act on.
function describeError(err, timeoutMs) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return `Timed out after ${timeoutMs / 1000}s`;
  }
  // Connecting to a dual-stack host (IPv4 + IPv6) can fail with an AggregateError of several errors.
  const code = err?.cause?.code || err?.cause?.errors?.[0]?.code || err?.code;
  const messages = {
    ENOTFOUND: 'DNS lookup failed (host not found)',
    EAI_AGAIN: 'DNS lookup timed out',
    ECONNREFUSED: 'Connection refused',
    ECONNRESET: 'Connection reset by server',
    EHOSTUNREACH: 'Host unreachable',
    ENETUNREACH: 'Network unreachable',
    UND_ERR_SOCKET: 'Socket closed unexpectedly',
    CERT_HAS_EXPIRED: 'TLS certificate has expired',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS certificate is self-signed',
    SELF_SIGNED_CERT_IN_CHAIN: 'TLS certificate chain is self-signed',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS certificate could not be verified',
    ERR_TLS_CERT_ALTNAME_INVALID: 'TLS certificate does not match the host name',
  };
  if (code && messages[code]) return messages[code];
  return err?.cause?.message || err?.message || 'Request failed';
}

/**
 * @param {{ url: string, method: string, expectedStatus: number, timeoutMs: number }} target
 * @returns {Promise<{ ok: boolean, statusCode?: number, responseTimeMs: number, error?: string }>}
 */
export async function performCheck({ url, method = 'GET', expectedStatus = 200, timeoutMs = 10000 }) {
  const started = performance.now();
  // If the admin expects a redirect (3xx), don't follow it, so we can see the 3xx itself.
  const expectsRedirect = expectedStatus >= 300 && expectedStatus < 400;

  try {
    const res = await fetch(url, {
      method,
      redirect: expectsRedirect ? 'manual' : 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    const responseTimeMs = Math.round(performance.now() - started);
    await res.body?.cancel().catch(() => {}); // we only need the status, don't download the body

    const ok = res.status === expectedStatus;
    return {
      ok,
      statusCode: res.status,
      responseTimeMs,
      ...(ok ? {} : { error: `Expected status ${expectedStatus}, got ${res.status}` }),
    };
  } catch (err) {
    return {
      ok: false,
      responseTimeMs: Math.round(performance.now() - started),
      error: describeError(err, timeoutMs),
    };
  }
}
