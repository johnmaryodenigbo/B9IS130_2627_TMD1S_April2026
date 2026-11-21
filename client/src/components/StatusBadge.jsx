const LABELS = { up: 'Up', down: 'Down', pending: 'Pending', paused: 'Paused' };

export default function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{LABELS[status] || status}</span>;
}

// Amber "users reporting issues" badge, shown next to the status.
export function ReportsBadge({ monitor, showCount = false }) {
  if (monitor.reportStatus === 'elevated') {
    return <span className="status status-reports" title={`${monitor.reportsRecent} user reports in the last 15 minutes`}>⚠ Users reporting issues</span>;
  }
  if (showCount && monitor.reportsRecent > 0) {
    return <span className="muted small">{monitor.reportsRecent} report{monitor.reportsRecent > 1 ? 's' : ''} (15 min)</span>;
  }
  return null;
}
