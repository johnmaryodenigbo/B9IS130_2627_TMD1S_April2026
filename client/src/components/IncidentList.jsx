import { timeAgo, formatDuration } from '../utils/format.js';

const RESOLUTION_LABEL = { recovered: 'Recovered', paused: 'Monitor paused', reset: 'Monitor changed', deleted: 'Monitor deleted' };

// Summary of the emails sent for an incident, e.g. "2 emails · last to sre@x.io".
function EmailSummary({ notifications = [], alertsSuppressed }) {
  if (alertsSuppressed) return <span className="muted small">No email (flapping, within cooldown)</span>;
  if (!notifications.length) return <span className="muted small">No email yet</span>;
  const last = notifications.at(-1);
  return (
    <span className={`small ${last.ok ? 'muted' : 'error-text'}`}>
      {notifications.length} email{notifications.length > 1 ? 's' : ''} · last {timeAgo(last.sentAt)}
      {last.ok ? ` to ${last.recipients.join(', ')}` : ` failed: ${last.error}`}
      {last.ok && last.error && <span className="warn-text"> ({last.error})</span>}
    </span>
  );
}

// Open incidents with Acknowledge / Check now buttons.
export function OpenIncidents({ incidents, onAcknowledge, onCheckNow, busyId }) {
  if (!incidents.length) return <p className="muted">No open incidents. Everything monitored is up.</p>;
  return (
    <ul className="status-list">
      {incidents.map((i) => (
        <li key={i.id} className="status-row-top incident">
          <div>
            <strong>{i.monitorName}</strong> <span className="env">{i.environment}</span>
            <div className="error-text small">{i.cause || 'Down'} · down for {formatDuration(Date.now() - new Date(i.startedAt))}</div>
            <EmailSummary notifications={i.notifications} alertsSuppressed={i.alertsSuppressed} />
            {i.acknowledgedAt && (
              <div className="ok-text small">Acknowledged by {i.acknowledgedBy?.name} {timeAgo(i.acknowledgedAt)}</div>
            )}
          </div>
          <div className="status-meta">
            <button className="btn btn-small btn-ghost" disabled={busyId === i.monitor} onClick={() => onCheckNow(i.monitor)}>
              {busyId === i.monitor ? 'Checking…' : 'Check now'}
            </button>
            {!i.acknowledgedAt && (
              <button className="btn btn-small" onClick={() => onAcknowledge(i.id)} title="Stops reminder emails">
                Acknowledge
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// Table of resolved incidents.
export function IncidentHistory({ incidents }) {
  if (!incidents.length) return <p className="muted">No incidents yet.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Monitor</th><th>Started</th><th>Duration</th><th>Cause</th><th>Outcome</th><th>Emails</th></tr>
        </thead>
        <tbody>
          {incidents.map((i) => (
            <tr key={i.id}>
              <td><strong>{i.monitorName}</strong> <span className="env">{i.environment}</span></td>
              <td className="small">{new Date(i.startedAt).toLocaleString()}</td>
              <td>{formatDuration(i.durationMs)}</td>
              <td className="small error-text">{i.cause}</td>
              <td className="small">{RESOLUTION_LABEL[i.resolution] || i.resolution}{i.acknowledgedBy?.name && <div className="muted">ack: {i.acknowledgedBy.name}</div>}</td>
              <td><EmailSummary notifications={i.notifications} alertsSuppressed={i.alertsSuppressed} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
