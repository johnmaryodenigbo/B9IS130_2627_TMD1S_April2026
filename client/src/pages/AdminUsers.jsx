import { useEffect, useState } from 'react';
import { usersApi, alertsApi, subscribersApi, ROLES } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const emptyForm = { name: '', email: '', password: '', role: ROLES.SRE };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [alertInfo, setAlertInfo] = useState(null);
  const [subs, setSubs] = useState(null);

  const load = () =>
    Promise.all([
      usersApi.list().then(({ users }) => setUsers(users)),
      alertsApi.recipients().then(setAlertInfo),
      subscribersApi.stats().then(setSubs),
    ]).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message);
    }
  };

  const onCreate = (e) => {
    e.preventDefault();
    run(async () => {
      await usersApi.create(form);
      setForm(emptyForm);
    });
  };

  return (
    <section>
      <h1>User management</h1>

      {alertInfo && (
        <div className={`card notice ${alertInfo.fallback ? 'notice-warn' : ''}`}>
          <strong>Downtime alerts</strong> currently go to{' '}
          {alertInfo.recipients.length ? alertInfo.recipients.join(', ') : 'nobody'}
          {alertInfo.fallback && ' (no SRE is on call, so admins are emailed instead)'}
          <span className="muted"> · via {alertInfo.transport}</span>
        </div>
      )}

      <div className="card">
        <h2>Add user</h2>
        <form onSubmit={onCreate} className="form inline">
          <input placeholder="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Temporary password" type="password" required minLength={8} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value={ROLES.SRE}>SRE (on-call)</option>
            <option value={ROLES.ADMIN}>Admin</option>
          </select>
          <button className="btn">Add</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>Users ({users.length})</h2>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th title="On-call SREs receive downtime emails">On call</th><th>Last login</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.id === me.id && <span className="muted"> (you)</span>}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => run(() => usersApi.update(u.id, { role: e.target.value }))}>
                    <option value={ROLES.SRE}>sre</option>
                    <option value={ROLES.ADMIN}>admin</option>
                  </select>
                </td>
                <td>
                  <button className={`btn btn-small ${u.isActive ? 'btn-ok' : 'btn-ghost'}`}
                    onClick={() => run(() => usersApi.update(u.id, { isActive: !u.isActive }))}>
                    {u.isActive ? 'Active' : 'Disabled'}
                  </button>
                </td>
                <td>
                  {u.role === ROLES.SRE ? (
                    <button className={`btn btn-small ${u.onCall ? 'btn-ok' : 'btn-ghost'}`}
                      title={u.onCall ? 'Receives downtime emails' : 'Does not receive downtime emails'}
                      onClick={() => run(() => usersApi.update(u.id, { onCall: !u.onCall }))}>
                      {u.onCall ? 'On call' : 'Off'}
                    </button>
                  ) : (
                    <span className="muted small" title="Admins are emailed only when no SRE is on call">backup</span>
                  )}
                </td>
                <td className="muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                <td>
                  {u.id !== me.id && (
                    <button className="btn btn-small btn-danger"
                      onClick={() => window.confirm(`Delete ${u.email}?`) && run(() => usersApi.remove(u.id))}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {subs && (
        <div className="card">
          <h2>Status page subscribers ({subs.confirmed})</h2>
          <p className="muted small">
            Visitors who confirmed "Get notified" on the status page. They are emailed when a public monitor has an outage
            and when it's resolved. {subs.pending > 0 && `${subs.pending} sign-up(s) waiting for confirmation.`}
          </p>
          {subs.subscribers.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Email</th><th>Services</th><th>Since</th></tr></thead>
                <tbody>
                  {subs.subscribers.map((s) => (
                    <tr key={s.email}>
                      <td>{s.email}</td>
                      <td>{s.services === 'all' ? 'All' : s.services}</td>
                      <td className="muted small">{new Date(s.confirmedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
