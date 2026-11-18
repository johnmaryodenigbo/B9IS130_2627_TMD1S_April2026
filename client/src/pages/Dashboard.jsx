import { useCallback, useEffect, useState } from 'react';
import { publicApi } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import UptimeBars from '../components/UptimeBars.jsx';
import LiveIndicator from '../components/LiveIndicator.jsx';
import { useLiveMonitors } from '../hooks/useLiveMonitors.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import { timeAgo, formatUptime, formatDuration } from '../utils/format.js';

const FALLBACK_REFRESH_MS = 60000; // safety net; normal updates arrive live over Socket.IO
const ENV_ORDER = ['production', 'staging', 'qa', 'development'];

// Public status dashboard (no login). Updates live over Socket.IO.
export default function Dashboard() {
  const [monitors, setMonitors] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [incidents, setIncidents] = useState([]);

  const loadIncidents = useCallback(
    () => publicApi.incidents(14).then(({ incidents }) => setIncidents(incidents)).catch(() => {}),
    []
  );

  const load = useCallback(
    () =>
      Promise.all([
        publicApi.monitors().then(({ monitors }) => { setMonitors(monitors); setError(''); setUpdatedAt(new Date()); }),
        loadIncidents(),
      ]).catch((e) => setError(e.message)),
    [loadIncidents]
  );

  useEffect(() => {
    load();
    const id = setInterval(load, FALLBACK_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useLiveMonitors({ monitors, setMonitors, refetch: load, publicOnly: true, onEvent: () => setUpdatedAt(new Date()) });

  // Keep the incident list current (opened / resolved).
  useSocketEvent('incident:update', (incident) => {
    if (incident.isPublic === false) return; // staff also receive private ones
    setIncidents((list) => {
      const rest = list.filter((i) => i.id !== incident.id);
      return [incident, ...rest].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    });
  });

  const active = (monitors || []).filter((m) => m.status !== 'paused');
  const down = active.filter((m) => m.status === 'down').length;
  const allUp = active.length > 0 && active.every((m) => m.status === 'up');

  let banner = { cls: '', text: 'Loading…' };
  if (error) banner = { cls: 'down', text: 'Status service is unreachable' };
  else if (monitors && down) banner = { cls: 'down', text: `${down} system${down > 1 ? 's' : ''} down` };
  else if (allUp) banner = { cls: 'up', text: 'All systems operational' };
  else if (monitors) banner = { cls: '', text: active.length ? 'Waiting for first checks…' : 'No systems are being monitored yet' };

  const groups = ENV_ORDER
    .map((env) => [env, (monitors || []).filter((m) => m.environment === env)])
    .filter(([, list]) => list.length);

  return (
    <section>
      <div className="page-header">
        <h1>System status</h1>
        <div className="status-meta">
          {updatedAt && <span className="muted small">Updated {updatedAt.toLocaleTimeString()}</span>}
          <LiveIndicator />
        </div>
      </div>
      <div className={`status-banner ${banner.cls}`}>{banner.text}</div>

      {groups.map(([env, list]) => (
        <div className="card" key={env}>
          <h2 className="env-title">{env}</h2>
          <ul className="status-list">
            {list.map((m) => (
              <li key={m.id}>
                <div className="status-row-top">
                  <div>
                    <strong>{m.name}</strong>
                    {m.description && <div className="muted small">{m.description}</div>}
                  </div>
                  <div className="status-meta">
                    {m.status === 'down' && m.statusChangedAt && (
                      <span className="error-text small">down since {timeAgo(m.statusChangedAt)}</span>
                    )}
                    {m.status === 'up' && m.lastResponseTimeMs != null && (
                      <span className="muted small">{m.lastResponseTimeMs} ms</span>
                    )}
                    <StatusBadge status={m.status} />
                  </div>
                </div>
                <UptimeBars history={m.history} />
                <div className="bars-legend muted small">
                  <span>30 days ago</span>
                  <span>{formatUptime(m.uptime?.month)} uptime</span>
                  <span>Today</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {monitors && (
        <div className="card">
          <h2>Incidents in the last 14 days</h2>
          {incidents.length === 0 ? (
            <p className="muted">No incidents.</p>
          ) : (
            <ul className="status-list">
              {incidents.map((i) => (
                <li key={i.id} className="status-row-top">
                  <div>
                    <strong>{i.monitorName}</strong> <span className="env">{i.environment}</span>
                    <div className="muted small">{new Date(i.startedAt).toLocaleString()}</div>
                  </div>
                  {i.status === 'open'
                    ? <span className="status status-down">Ongoing</span>
                    : <span className="muted small">Resolved after {formatDuration(i.durationMs)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
