import { useEffect, useRef, useState } from 'react';
import { publicApi } from '../api/client.js';

// "Get notified": a visitor leaves an email to hear about outages (all services or chosen ones).
export default function SubscribeDialog({ monitors, preselect, onClose }) {
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState(preselect ? 'some' : 'all');
  const [selected, setSelected] = useState(() => new Set(preselect ? [preselect.id] : []));
  const [state, setState] = useState({ status: 'idle', message: '' });
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal?.();
    return () => dialog?.close?.();
  }, []);

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async (e) => {
    e.preventDefault();
    if (scope === 'some' && selected.size === 0) {
      setState({ status: 'error', message: 'Pick at least one service, or choose all services.' });
      return;
    }
    setState({ status: 'sending', message: '' });
    try {
      const res = await publicApi.subscribe(email, scope === 'all' ? [] : [...selected]);
      setState({ status: 'done', message: res.message });
    } catch (err) {
      setState({ status: 'error', message: err.details?.[0]?.message || err.message });
    }
  };

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit} className="form">
        <h2>Get notified about outages</h2>
        {state.status === 'done' ? (
          <p className="success">{state.message} The link is valid for 7 days.</p>
        ) : (
          <>
            <label>
              Email
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" />
            </label>
            <fieldset className="choices">
              <legend className="muted small">Email me about</legend>
              <label className={`choice ${scope === 'all' ? 'selected' : ''}`}>
                <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} /> All services
              </label>
              <label className={`choice ${scope === 'some' ? 'selected' : ''}`}>
                <input type="radio" name="scope" checked={scope === 'some'} onChange={() => setScope('some')} /> Only the services I pick
              </label>
            </fieldset>
            {scope === 'some' && (
              <div className="pick-list">
                {monitors.map((m) => (
                  <label key={m.id} className="check">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                    {m.name} <span className="env">{m.environment}</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
        {state.status === 'error' && <p className="error">{state.message}</p>}
        <div className="actions">
          {state.status !== 'done' && (
            <button className="btn" disabled={state.status === 'sending'}>
              {state.status === 'sending' ? 'Sending…' : 'Subscribe'}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>{state.status === 'done' ? 'Close' : 'Cancel'}</button>
        </div>
        <p className="muted small">We'll send a confirmation link first. Every email has a one-click unsubscribe link.</p>
      </form>
    </dialog>
  );
}
