// "just now", "5 min ago", "3 h ago", "2 d ago"
export function timeAgo(date) {
  if (!date) return 'never';
  const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

// 99.95 -> "99.95%", null -> "—"
export const formatUptime = (value) => (value == null ? '—' : `${value}%`);

// Colour class for an uptime percentage.
export function uptimeClass(value) {
  if (value == null) return 'none';
  if (value >= 99.5) return 'good';
  if (value >= 95) return 'warn';
  return 'bad';
}
