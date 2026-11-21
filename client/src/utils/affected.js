// "Most affected right now" ordering, like Downdetector's front page.
// Higher score = shown first. Ties: more user reports, then lower 24h uptime, then name.

function recentFailures(m) {
  // failed checks in the last hour (the last two 30-minute sparkline slots)
  return (m.sparkline || []).slice(-2).reduce((n, b) => n + (b.failed || 0), 0);
}

export function affectedScore(m) {
  if (m.status === 'down') return 5;
  if (m.reportStatus === 'elevated') return 4;
  if (recentFailures(m) > 0) return 3;
  if ((m.reportsRecent || 0) > 0) return 2;
  if (m.status === 'pending') return 1;
  if (m.status === 'paused') return -1;
  return 0;
}

export function sortMostAffected(monitors) {
  return [...monitors].sort(
    (a, b) =>
      affectedScore(b) - affectedScore(a) ||
      (b.reportsRecent || 0) - (a.reportsRecent || 0) ||
      (a.uptime?.day ?? 100) - (b.uptime?.day ?? 100) ||
      a.name.localeCompare(b.name)
  );
}

export const sortByName = (monitors) =>
  [...monitors].sort((a, b) => a.name.localeCompare(b.name) || a.environment.localeCompare(b.environment));
