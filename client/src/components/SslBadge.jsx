const DAY = 24 * 60 * 60 * 1000;

// Days until the certificate expires, from the stored expiry date (so it stays current between checks).
export const sslDaysLeft = (m) => (m.sslValidTo ? Math.floor((new Date(m.sslValidTo) - Date.now()) / DAY) : null);

// "🔒 SSL 64 d" — green, amber (≤ 30 days) or red (≤ 7 days, expired or not trusted). Staff views only.
export default function SslBadge({ monitor: m }) {
  if (!m.url?.startsWith('https://')) return null;
  if (!m.sslCheckedAt) return <span className="ssl ssl-none" title="Certificate not checked yet">🔒 SSL pending</span>;
  if (m.sslValidTo == null) return <span className="ssl ssl-bad" title={m.sslError}>🔒 SSL error</span>;

  const days = sslDaysLeft(m);
  const level = days < 0 || m.sslTrusted === false || days <= 7 ? 'bad' : days <= 30 ? 'warn' : 'good';
  const text = days < 0 ? 'SSL expired' : `SSL ${days} d`;
  const title = [
    `Expires ${new Date(m.sslValidTo).toLocaleString()}`,
    m.sslIssuer && `Issued by ${m.sslIssuer}`,
    m.sslSubject && `For ${m.sslSubject}`,
    m.sslTrusted === false && `Not trusted: ${m.sslError}`,
  ].filter(Boolean).join('\n');
  return <span className={`ssl ssl-${level}`} title={title}>🔒 {text}{m.sslTrusted === false ? ' ⚠' : ''}</span>;
}
