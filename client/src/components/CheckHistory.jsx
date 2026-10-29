import { useEffect, useState } from 'react';
import { monitorsApi } from '../api/client.js';

// Table of the most recent check results for one monitor.
export default function CheckHistory({ monitor, refreshKey, onClose }) {
  const [checks, setChecks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    monitorsApi.checks(monitor.id, 20).then(({ checks }) => setChecks(checks)).catch((e) => setError(e.message));
  }, [monitor.id, refreshKey]);

  return (
    <div className="card">
      <div className="page-header">
        <h2>Recent checks: {monitor.name} <span className="env">{monitor.environment}</span></h2>
        <button className="btn btn-small btn-ghost" onClick={onClose}>Close</button>
      </div>
      {error && <p className="error">{error}</p>}
      {!checks ? (
        <p className="muted">Loading…</p>
      ) : checks.length === 0 ? (
        <p className="muted">No checks yet. The worker will check this monitor shortly.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Result</th><th>Status code</th><th>Response time</th><th>Error</th></tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td className="small">{new Date(c.checkedAt).toLocaleString()}</td>
                  <td><span className={`status status-${c.ok ? 'up' : 'down'}`}>{c.ok ? 'OK' : 'Failed'}</span></td>
                  <td>{c.statusCode ?? '—'}</td>
                  <td>{c.responseTimeMs != null ? `${c.responseTimeMs} ms` : '—'}</td>
                  <td className="small error-text">{c.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
