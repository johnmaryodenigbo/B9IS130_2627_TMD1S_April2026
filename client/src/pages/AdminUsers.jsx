import { useEffect, useState } from 'react';
import { usersApi, ROLES } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const emptyForm = { name: '', email: '', password: '', role: ROLES.SRE };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = () => usersApi.list().then(({ users }) => setUsers(users)).catch((e) => setError(e.message));
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
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th /></tr>
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
    </section>
  );
}
