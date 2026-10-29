const LABELS = { up: 'Up', down: 'Down', pending: 'Pending', paused: 'Paused' };

export default function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{LABELS[status] || status}</span>;
}
