import { useEffect, useState } from 'react';
import { publicApi } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import UptimeBars from '../components/UptimeBars.jsx';
import { timeAgo, formatUptime } from '../utils/format.js';

const REFRESH_MS = 15000;
const ENV_ORDER = ['production', 'staging', 'qa', 'development'];

// Public status dashboard (no login). Live push updates arrive in phase 4; for now it polls.
export default function Dashboard() {
  const [monitors, setMonitors] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    const load = () =>
      publicApi
        .monitors()
        .then(({ monitors }) => { setMonitors(monitors); setError(''); setUpdatedAt(new Date()); })
        .catch((e) => setError(e.message));
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

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
        {updatedAt && <span className="muted small">Updated {updatedAt.toLocaleTimeString()}</span>}
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
    </section>
  );
}
