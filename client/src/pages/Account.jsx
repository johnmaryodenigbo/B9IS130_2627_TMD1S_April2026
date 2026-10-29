import { useState } from 'react';
import { authApi } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Account() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await authApi.changePassword(form.currentPassword, form.newPassword);
      setForm({ currentPassword: '', newPassword: '' });
      setMsg({ ok: true, text: 'Password updated' });
    } catch (err) {
      setMsg({ ok: false, text: err.details?.[0]?.message || err.message });
    }
  };

  return (
    <section className="card narrow">
      <h1>My account</h1>
      <p><strong>{user.name}</strong> · {user.email} · <span className={`badge badge-${user.role}`}>{user.role}</span></p>
      <h2>Change password</h2>
      <form onSubmit={onSubmit} className="form">
        <label>
          Current password
          <input type="password" required autoComplete="current-password" value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        </label>
        <label>
          New password
          <input type="password" required minLength={8} autoComplete="new-password" value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        </label>
        <small className="muted">At least 8 characters, with a letter and a number.</small>
        {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
        <button className="btn">Update password</button>
      </form>
    </section>
  );
}
