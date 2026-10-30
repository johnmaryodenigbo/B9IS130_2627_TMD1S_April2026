import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { monitorsApi } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LiveIndicator from '../components/LiveIndicator.jsx';
import { useLiveMonitors } from '../hooks/useLiveMonitors.js';
import { timeAgo } from '../utils/format.js';

const FALLBACK_REFRESH_MS = 60000; // safety net; normal updates arrive live over Socket.IO

// SRE home: what is broken right now, updated live. Email alerts arrive in phase 5.
export default function OnCall() {
  const { user } = useAuth();
  const [monitors, setMonitors] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(null);

  const load = useCallback(
    () => monitorsApi.list({ active: 'true' }).then(({ monitors }) => { setMonitors(monitors); setError(''); }).catch((e) => setError(e.message)),
    []
  );

  useEffect(() => {
    load();
    const id = setInterval(load, FALLBACK_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useLiveMonitors({ monitors, setMonitors, refetch: load });

  const checkNow = async (id) => {
    setChecking(id);
    try { await monitorsApi.checkNow(id); await load(); } catch (e) { setError(e.message); }
    setChecking(null);
  };

  const down = (monitors || []).filter((m) => m.status === 'down');
  const degraded = (monitors || []).filter((m) => m.status === 'up' && m.consecutiveFailures > 0);
  const up = (monitors || []).filter((m) => m.status === 'up').length;

  return (
    <section>
      <div className="page-header">
        <h1>Welcome, {user.name}</h1>
        <LiveIndicator />
      </div>
      {error && <p className="error card">{error}</p>}

      <div className="stats">
        <div className="card stat"><span className="stat-value">{monitors ? monitors.length : '—'}</span><span className="muted">active monitors</span></div>
        <div className="card stat"><span className="stat-value ok-text">{monitors ? up : '—'}</span><span className="muted">up</span></div>
        <div className="card stat"><span className={`stat-value ${down.length ? 'error-text' : ''}`}>{monitors ? down.length : '—'}</span><span className="muted">down</span></div>
      </div>

      <div className="card">
        <h2>Currently down</h2>
        {!monitors ? (
          <p className="muted">Loading…</p>
        ) : down.length === 0 ? (
          <p className="muted">Nothing is down right now.</p>
        ) : (
          <ul className="status-list">
            {down.map((m) => (
              <li key={m.id} className="status-row-top">
                <div>
                  <strong>{m.name}</strong> <span className="env">{m.environment}</span>
                  <div className="mono small muted">{m.method} {m.url}</div>
                  <div className="error-text small">{m.lastError} · down since {timeAgo(m.statusChangedAt)}</div>
                </div>
                <div className="status-meta">
                  <button className="btn btn-small btn-ghost" disabled={checking === m.id} onClick={() => checkNow(m.id)}>
                    {checking === m.id ? 'Checking…' : 'Check now'}
                  </button>
                  <StatusBadge status={m.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {degraded.length > 0 && (
        <div className="card">
          <h2>Failing, not down yet</h2>
          <p className="muted small">These failed their last check but haven't reached the failure threshold.</p>
          <ul className="status-list">
            {degraded.map((m) => (
              <li key={m.id} className="status-row-top">
                <div><strong>{m.name}</strong> <span className="env">{m.environment}</span>
                  <div className="error-text small">{m.lastError}</div></div>
                <StatusBadge status="pending" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted small">
        Downtime email alerts to <strong>{user.email}</strong> arrive in a later phase. See all <Link to="/monitors">monitors</Link>.
      </p>
    </section>
  );
}
