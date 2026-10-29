import { useEffect, useState } from 'react';
import { publicApi } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';

// Public status dashboard (no login). Live updates arrive in phase 4; for now it polls.
export default function Dashboard() {
  const [monitors, setMonitors] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () =>
      publicApi
        .monitors()
        .then(({ monitors }) => { setMonitors(monitors); setError(''); })
        .catch((e) => setError(e.message));
    load();
    const id = setInterval(load, 30000);
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

  // Group by environment, keeping a fixed order.
  const groups = ['production', 'staging', 'qa', 'development']
    .map((env) => [env, (monitors || []).filter((m) => m.environment === env)])
    .filter(([, list]) => list.length);

  return (
    <section>
      <h1>System status</h1>
      <div className={`status-banner ${banner.cls}`}>{banner.text}</div>

      {groups.map(([env, list]) => (
        <div className="card" key={env}>
          <h2 className="env-title">{env}</h2>
          <ul className="status-list">
            {list.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.name}</strong>
                  {m.description && <div className="muted small">{m.description}</div>}
                </div>
                <div className="status-meta">
                  {m.lastResponseTimeMs != null && <span className="muted small">{m.lastResponseTimeMs} ms</span>}
                  <StatusBadge status={m.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
