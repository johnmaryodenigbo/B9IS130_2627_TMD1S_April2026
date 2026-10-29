import { uptimeClass, formatUptime } from '../utils/format.js';

// One bar per day (oldest on the left), coloured by that day's uptime.
export default function UptimeBars({ history = [] }) {
  return (
    <div className="bars" role="img" aria-label={`Uptime for the last ${history.length} days`}>
      {history.map((d) => (
        <span key={d.date} className={`bar bar-${uptimeClass(d.uptime)}`}
          title={`${d.date}: ${d.uptime == null ? 'no data' : formatUptime(d.uptime)}`} />
      ))}
    </div>
  );
}
