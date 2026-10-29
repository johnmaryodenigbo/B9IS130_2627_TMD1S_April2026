import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../hooks/useSocket.js';

const SHOW_MS = 10000;

// Pop-up toasts for logged-in staff when a monitor goes down or recovers.
export default function LiveAlerts() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState([]);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useSocketEvent('monitor:status', ({ monitor, from, to, check }) => {
    if (!user || (to !== 'down' && !(to === 'up' && from === 'down'))) return;
    const toast = { key: `${monitor.id}-${Date.now()}`, monitor, to, error: check?.error };
    setToasts((t) => [toast, ...t].slice(0, 5));
    timers.current.push(setTimeout(() => setToasts((t) => t.filter((x) => x.key !== toast.key)), SHOW_MS));
  });

  if (!user || toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.key} className={`toast toast-${t.to}`}>
          <div>
            <strong>{t.monitor.name}</strong> <span className="env">{t.monitor.environment}</span>
            <div>{t.to === 'down' ? `is DOWN${t.error ? ` — ${t.error}` : ''}` : 'has recovered'}</div>
          </div>
          <button className="toast-close" aria-label="Dismiss"
            onClick={() => setToasts((all) => all.filter((x) => x.key !== t.key))}>×</button>
        </div>
      ))}
    </div>
  );
}
