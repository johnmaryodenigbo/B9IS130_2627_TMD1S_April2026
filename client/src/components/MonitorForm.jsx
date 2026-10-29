import { useState } from 'react';
import { HTTP_METHODS, ENVIRONMENTS, INTERVALS } from '../api/client.js';

export const emptyMonitor = {
  name: '',
  url: '',
  description: '',
  method: 'GET',
  expectedStatus: 200,
  intervalSeconds: 60,
  timeoutSeconds: 10,
  environment: 'production',
  isPublic: true,
  isActive: true,
};

// Converts an API monitor into form values (the form shows the timeout in seconds).
export const toFormValues = (m) => ({
  ...emptyMonitor,
  ...m,
  timeoutSeconds: Math.round((m.timeoutMs ?? 10000) / 1000),
});

// Converts form values into the API body.
const toPayload = ({ timeoutSeconds, ...v }) => ({
  name: v.name,
  url: v.url,
  description: v.description,
  method: v.method,
  expectedStatus: Number(v.expectedStatus),
  intervalSeconds: Number(v.intervalSeconds),
  timeoutMs: Number(timeoutSeconds) * 1000,
  environment: v.environment,
  isPublic: v.isPublic,
  isActive: v.isActive,
});

export default function MonitorForm({ initial = emptyMonitor, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) =>
    setForm({ ...form, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(toPayload(form));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form grid">
      <label>
        Name
        <input required maxLength={100} value={form.name} onChange={set('name')} placeholder="Payments API" />
      </label>
      <label className="span-2">
        URL
        <input required type="url" value={form.url} onChange={set('url')} placeholder="https://api.example.com/health" />
      </label>
      <label>
        Environment
        <select value={form.environment} onChange={set('environment')}>
          {ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
        </select>
      </label>
      <label>
        Method
        <select value={form.method} onChange={set('method')}>
          {HTTP_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label>
        Expected status
        <input type="number" min={100} max={599} required value={form.expectedStatus} onChange={set('expectedStatus')} />
      </label>
      <label>
        Check every
        <select value={form.intervalSeconds} onChange={set('intervalSeconds')}>
          {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
        </select>
      </label>
      <label>
        Timeout (seconds)
        <input type="number" min={1} max={30} required value={form.timeoutSeconds} onChange={set('timeoutSeconds')} />
      </label>
      <label className="span-3">
        Description
        <input maxLength={500} value={form.description} onChange={set('description')} placeholder="Optional" />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.isPublic} onChange={set('isPublic')} /> Show on public dashboard
      </label>
      <label className="check">
        <input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Active (uncheck to pause)
      </label>
      <div className="actions span-3">
        <button className="btn" disabled={submitting}>{submitting ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
