import { useEffect, useRef, useState } from 'react';
import { publicApi, REPORT_CATEGORIES } from '../api/client.js';

const storageKey = (id) => `zops-reported-${id}`;
const COOLDOWN_MS = 10 * 60 * 1000;

// Remembers (in this browser) that the visitor already reported this monitor recently.
export function reportedRecently(id) {
  try {
    const at = Number(localStorage.getItem(storageKey(id)));
    return at > 0 && Date.now() - at < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberReport(id) {
  try { localStorage.setItem(storageKey(id), String(Date.now())); } catch { /* storage unavailable */ }
}

// "I have a problem with <service>" dialog.
export default function ReportDialog({ monitor, onClose, onReported }) {
  const [category, setCategory] = useState('down');
  const [state, setState] = useState({ status: 'idle', message: '' });
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal?.();
    return () => dialog?.close?.();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending', message: '' });
    try {
      await publicApi.report(monitor.id, category);
      rememberReport(monitor.id);
      setState({ status: 'done', message: 'Thanks! Your report helps everyone see problems sooner.' });
      onReported?.();
    } catch (err) {
      if (err.status === 429) rememberReport(monitor.id);
      setState({ status: 'error', message: err.message });
    }
  };

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit} className="form">
        <h2>Problem with {monitor.name}?</h2>
        {state.status === 'done' ? (
          <p className="success">{state.message}</p>
        ) : (
          <fieldset className="choices">
            <legend className="muted small">What's wrong?</legend>
            {REPORT_CATEGORIES.map((c) => (
              <label key={c.value} className={`choice ${category === c.value ? 'selected' : ''}`}>
                <input type="radio" name="category" value={c.value} checked={category === c.value}
                  onChange={() => setCategory(c.value)} />
                {c.label}
              </label>
            ))}
          </fieldset>
        )}
        {state.status === 'error' && <p className="error">{state.message}</p>}
        <div className="actions">
          {state.status !== 'done' && (
            <button className="btn" disabled={state.status === 'sending'}>
              {state.status === 'sending' ? 'Sending…' : 'Report problem'}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {state.status === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
        <p className="muted small">Reports are anonymous. We only keep a one-way hash of your network address to stop duplicate reports.</p>
      </form>
    </dialog>
  );
}
