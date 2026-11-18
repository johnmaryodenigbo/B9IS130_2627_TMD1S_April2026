import { useState } from 'react';
import { authApi, alertsApi, ROLES } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Account() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState(null);
  const [alertMsg, setAlertMsg] = useState(null);
  const [sending, setSending] = useState(false);

  const toggleOnCall = async () => {
    setAlertMsg(null);
    try {
      const { user: updated } = await authApi.updateMe({ onCall: !user.onCall });
      setUser(updated);
    } catch (err) {
      setAlertMsg({ ok: false, text: err.message });
    }
  };

  const sendTest = async () => {
    setSending(true);
    setAlertMsg(null);
    try {
      const res = await alertsApi.test();
      setAlertMsg({ ok: true, text: `Test email sent to ${res.to} (via ${res.transport}).` });
    } catch (err) {
      setAlertMsg({ ok: false, text: err.message });
    } finally {
      setSending(false);
    }
  };

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
      <h2>Downtime alerts</h2>
      {user.role === ROLES.SRE ? (
        <label className="check">
          <input type="checkbox" checked={user.onCall !== false} onChange={toggleOnCall} />
          Email me when a monitor goes down or recovers (on call)
        </label>
      ) : (
        <p className="muted small">Admins are emailed only when no SRE is on call.</p>
      )}
      <div className="actions">
        <button type="button" className="btn btn-ghost" disabled={sending} onClick={sendTest}>
          {sending ? 'Sending…' : 'Send me a test email'}
        </button>
      </div>
      {alertMsg && <p className={alertMsg.ok ? 'success' : 'error'}>{alertMsg.text}</p>}

      <h2 className="section-gap">Change password</h2>
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
