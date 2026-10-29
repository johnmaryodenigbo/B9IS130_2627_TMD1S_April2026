import { useCallback, useEffect, useState } from 'react';
import { monitorsApi, ROLES, ENVIRONMENTS, INTERVALS } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import MonitorForm, { toFormValues } from '../components/MonitorForm.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import CheckHistory from '../components/CheckHistory.jsx';
import { timeAgo, formatUptime, uptimeClass } from '../utils/format.js';

const REFRESH_MS = 15000;
const intervalLabel = (s) => INTERVALS.find((i) => i.value === s)?.label || `${s}s`;
const errorText = (err) => err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message;

// Inventory of monitored applications. Admins manage it; SREs can view it and run checks.
export default function Monitors() {
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;

  const [monitors, setMonitors] = useState([]);
  const [filters, setFilters] = useState({ environment: '', q: '' });
  const [mode, setMode] = useState(null);       // null | 'create' | monitor being edited
  const [historyFor, setHistoryFor] = useState(null);
  const [checking, setChecking] = useState(null); // id of the monitor being checked now
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(
    () => monitorsApi.list(filters).then(({ monitors }) => setMonitors(monitors)).catch((e) => setError(errorText(e))),
    [filters]
  );

  // Load now and refresh regularly so results from the worker show up.
  useEffect(() => {
    load();
    const id = setInterval(() => { load(); setRefreshKey((k) => k + 1); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Runs an API call, shows any error, then reloads the list.
  const run = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  };

  const handleCreate = async (payload) => {
    if (await run(() => monitorsApi.create(payload))) setMode(null);
  };

  const handleUpdate = async (payload) => {
    if (await run(() => monitorsApi.update(mode.id, payload))) setMode(null);
  };

  const handleCheckNow = async (m) => {
    setChecking(m.id);
    await run(() => monitorsApi.checkNow(m.id));
    setRefreshKey((k) => k + 1);
    setChecking(null);
  };

  return (
    <section>
      <div className="page-header">
        <h1>Monitors</h1>
        {isAdmin && !mode && <button className="btn" onClick={() => setMode('create')}>+ Add monitor</button>}
      </div>

      {error && <p className="error card">{error}</p>}

      {isAdmin && mode && (
        <div className="card">
          <h2>{mode === 'create' ? 'Add monitor' : `Edit ${mode.name}`}</h2>
          <MonitorForm
            key={mode === 'create' ? 'new' : mode.id}
            initial={mode === 'create' ? undefined : toFormValues(mode)}
            submitLabel={mode === 'create' ? 'Add monitor' : 'Save changes'}
            onSubmit={mode === 'create' ? handleCreate : handleUpdate}
            onCancel={() => { setMode(null); setError(''); }}
          />
        </div>
      )}

      {historyFor && (
        <CheckHistory monitor={historyFor} refreshKey={refreshKey} onClose={() => setHistoryFor(null)} />
      )}

      <div className="card">
        <div className="toolbar">
          <input placeholder="Search by name" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select value={filters.environment} onChange={(e) => setFilters({ ...filters, environment: e.target.value })}>
            <option value="">All environments</option>
            {ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
          </select>
          <span className="muted">{monitors.length} monitor{monitors.length === 1 ? '' : 's'} · refreshes every {REFRESH_MS / 1000}s</span>
        </div>

        {monitors.length === 0 ? (
          <p className="muted">No monitors yet.{isAdmin && ' Click “Add monitor” to register your first application.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th><th>Name</th><th>Target</th><th>Every</th>
                  <th title="Uptime over the last 24 hours / 30 days">Uptime 24h / 30d</th>
                  <th>Last check</th><th />
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => (
                  <tr key={m.id}>
                    <td><StatusBadge status={m.status} /></td>
                    <td>
                      <button className="link" onClick={() => setHistoryFor(m)} title="Show recent checks">
                        <strong>{m.name}</strong>
                      </button>{' '}
                      <span className="env">{m.environment}</span>
                      {!m.isPublic && <span className="env" title="Not shown on the public dashboard">private</span>}
                      {m.description && <div className="muted small">{m.description}</div>}
                    </td>
                    <td className="mono small">
                      {m.method} {m.url}
                      <div className="muted">expects {m.expectedStatus} · timeout {m.timeoutMs / 1000}s</div>
                    </td>
                    <td>{intervalLabel(m.intervalSeconds)}</td>
                    <td>
                      <span className={`uptime uptime-${uptimeClass(m.uptime?.day)}`}>{formatUptime(m.uptime?.day)}</span>
                      <span className="muted"> / </span>
                      <span className={`uptime uptime-${uptimeClass(m.uptime?.month)}`}>{formatUptime(m.uptime?.month)}</span>
                    </td>
                    <td className="small">
                      {timeAgo(m.lastCheckedAt)}
                      {m.lastResponseTimeMs != null && <div className="muted">{m.lastStatusCode ? `${m.lastStatusCode} · ` : ''}{m.lastResponseTimeMs} ms</div>}
                      {m.lastError && m.status !== 'up' && <div className="error-text">{m.lastError}</div>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-small btn-ghost" disabled={!m.isActive || checking === m.id}
                          title={m.isActive ? 'Check now' : 'Resume the monitor first'} onClick={() => handleCheckNow(m)}>
                          {checking === m.id ? 'Checking…' : 'Check now'}
                        </button>
                        {isAdmin && (
                          <>
                            <button className="btn btn-small btn-ghost" onClick={() => setMode(m)}>Edit</button>
                            <button className="btn btn-small btn-ghost"
                              onClick={() => run(() => monitorsApi.update(m.id, { isActive: !m.isActive }))}>
                              {m.isActive ? 'Pause' : 'Resume'}
                            </button>
                            <button className="btn btn-small btn-danger"
                              onClick={() => window.confirm(`Delete monitor "${m.name}" and its check history?`) &&
                                run(() => monitorsApi.remove(m.id)).then(() => historyFor?.id === m.id && setHistoryFor(null))}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
