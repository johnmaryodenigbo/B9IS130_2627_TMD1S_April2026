import { useCallback, useEffect, useState } from 'react';
import { monitorsApi, ROLES, ENVIRONMENTS, INTERVALS } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import MonitorForm, { toFormValues } from '../components/MonitorForm.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const intervalLabel = (s) => INTERVALS.find((i) => i.value === s)?.label || `${s}s`;

const errorText = (err) => err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message;

// Inventory of monitored applications. Admins manage it; SREs can view it.
export default function Monitors() {
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;

  const [monitors, setMonitors] = useState([]);
  const [filters, setFilters] = useState({ environment: '', q: '' });
  const [mode, setMode] = useState(null); // null | 'create' | monitor being edited
  const [error, setError] = useState('');

  const load = useCallback(
    () => monitorsApi.list(filters).then(({ monitors }) => setMonitors(monitors)).catch((e) => setError(errorText(e))),
    [filters]
  );
  useEffect(() => { load(); }, [load]);

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

      <div className="card">
        <div className="toolbar">
          <input placeholder="Search by name" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select value={filters.environment} onChange={(e) => setFilters({ ...filters, environment: e.target.value })}>
            <option value="">All environments</option>
            {ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
          </select>
          <span className="muted">{monitors.length} monitor{monitors.length === 1 ? '' : 's'}</span>
        </div>

        {monitors.length === 0 ? (
          <p className="muted">No monitors yet.{isAdmin && ' Click “Add monitor” to register your first application.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th><th>Name</th><th>Environment</th><th>Target</th><th>Every</th><th>Public</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => (
                  <tr key={m.id}>
                    <td><StatusBadge status={m.status} /></td>
                    <td>
                      <strong>{m.name}</strong>
                      {m.description && <div className="muted small">{m.description}</div>}
                    </td>
                    <td><span className="env">{m.environment}</span></td>
                    <td className="mono small">
                      {m.method} {m.url}
                      <div className="muted">expects {m.expectedStatus} · timeout {m.timeoutMs / 1000}s</div>
                    </td>
                    <td>{intervalLabel(m.intervalSeconds)}</td>
                    <td>{m.isPublic ? 'Yes' : 'No'}</td>
                    {isAdmin && (
                      <td>
                        <div className="row-actions">
                        <button className="btn btn-small btn-ghost" onClick={() => setMode(m)}>Edit</button>
                        <button className="btn btn-small btn-ghost"
                          onClick={() => run(() => monitorsApi.update(m.id, { isActive: !m.isActive }))}>
                          {m.isActive ? 'Pause' : 'Resume'}
                        </button>
                        <button className="btn btn-small btn-danger"
                          onClick={() => window.confirm(`Delete monitor "${m.name}"?`) && run(() => monitorsApi.remove(m.id))}>
                          Delete
                        </button>
                        </div>
                      </td>
                    )}
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
