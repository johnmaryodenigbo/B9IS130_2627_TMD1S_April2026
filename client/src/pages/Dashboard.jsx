import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Public status dashboard. Real monitor data comes in the monitoring phase.
export default function Dashboard() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const load = () => api('/health').then(setHealth).catch((e) => setHealth({ status: 'down', error: e.message }));
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const ok = health?.status === 'ok';

  return (
    <section>
      <h1>System status</h1>
      <div className={`status-banner ${health ? (ok ? 'up' : 'down') : ''}`}>
        {!health ? 'Checking…' : ok ? 'Monitoring service is operational' : 'Monitoring service is degraded'}
      </div>
      <div className="card">
        <h2>Monitored applications</h2>
        <p className="muted">No applications are being monitored yet. Admins will add inventory in the next phase.</p>
      </div>
    </section>
  );
}
