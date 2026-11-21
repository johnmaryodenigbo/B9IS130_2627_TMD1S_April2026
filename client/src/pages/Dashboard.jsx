import { useCallback, useEffect, useState } from 'react';
import { publicApi } from '../api/client.js';
import StatusBadge, { ReportsBadge } from '../components/StatusBadge.jsx';
import UptimeBars from '../components/UptimeBars.jsx';
import Sparkline from '../components/Sparkline.jsx';
import ReportDialog, { reportedRecently } from '../components/ReportDialog.jsx';
import SubscribeDialog from '../components/SubscribeDialog.jsx';
import LiveIndicator from '../components/LiveIndicator.jsx';
import { useLiveMonitors } from '../hooks/useLiveMonitors.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import { timeAgo, formatUptime, formatDuration } from '../utils/format.js';
import { sortMostAffected, sortByName } from '../utils/affected.js';

const FALLBACK_REFRESH_MS = 60000; // safety net; normal updates arrive live over Socket.IO

function MonitorCard({ m, onReport, onSubscribe }) {
  const reported = reportedRecently(m.id);
  return (
    <article className={`card mcard mcard-${m.status} ${m.reportStatus === 'elevated' ? 'mcard-reports' : ''}`}>
      <header className="mcard-head">
        <div>
          <h3>{m.name}</h3>
          <span className="env">{m.environment}</span>
        </div>
        <div className="mcard-head-right">
          <StatusBadge status={m.status} />
          <button className="star" onClick={() => onSubscribe(m)} title={`Email me about ${m.name}`}
            aria-label={`Get email updates about ${m.name}`}>☆</button>
        </div>
      </header>
      {m.description && <p className="muted small mcard-desc">{m.description}</p>}
      <div className="mcard-flags">
        <ReportsBadge monitor={m} />
        {m.status === 'down' && m.statusChangedAt && <span className="error-text small">down since {timeAgo(m.statusChangedAt)}</span>}
      </div>

      <Sparkline data={m.sparkline} name={m.name} />

      <UptimeBars history={m.history} />
      <div className="bars-legend muted small">
        <span>Last 30 days</span>
        <span>{formatUptime(m.uptime?.month)} uptime</span>
        <span>{m.status === 'up' && m.lastResponseTimeMs != null ? `${m.lastResponseTimeMs} ms now` : 'today'}</span>
      </div>

      <footer className="mcard-foot">
        <span className="muted small">
          {m.reportsRecent > 0 ? `${m.reportsRecent} report${m.reportsRecent > 1 ? 's' : ''} in 15 min` : 'No recent reports'}
        </span>
        <button className="btn btn-small btn-ghost" disabled={reported || m.status === 'paused'} onClick={() => onReport(m)}
          title={reported ? 'You reported this recently' : 'Tell us something is wrong'}>
          {reported ? 'Reported ✓' : 'I have a problem'}
        </button>
      </footer>
    </article>
  );
}

// Public status page (no login): every public monitor as a card, most affected first. Live.
export default function Dashboard() {
  const [monitors, setMonitors] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [sort, setSort] = useState('affected');
  const [reporting, setReporting] = useState(null);
  const [subscribing, setSubscribing] = useState(null); // null | { preselect }

  const loadIncidents = useCallback(
    () => publicApi.incidents(14).then(({ incidents }) => setIncidents(incidents)).catch(() => {}),
    []
  );

  const load = useCallback(
    () =>
      Promise.all([
        publicApi.monitors().then(({ monitors }) => { setMonitors(monitors); setError(''); setUpdatedAt(new Date()); }),
        loadIncidents(),
      ]).catch((e) => setError(e.message)),
    [loadIncidents]
  );

  useEffect(() => {
    load();
    const id = setInterval(load, FALLBACK_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useLiveMonitors({ monitors, setMonitors, refetch: load, publicOnly: true, onEvent: () => setUpdatedAt(new Date()) });

  // Keep the incident list current (opened / resolved).
  useSocketEvent('incident:update', (incident) => {
    if (incident.isPublic === false) return; // staff also receive private ones
    setIncidents((list) => {
      const rest = list.filter((i) => i.id !== incident.id);
      return [incident, ...rest].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    });
  });

  const active = (monitors || []).filter((m) => m.status !== 'paused');
  const down = active.filter((m) => m.status === 'down').length;
  const reported = active.filter((m) => m.status !== 'down' && m.reportStatus === 'elevated').length;
  const allUp = active.length > 0 && active.every((m) => m.status === 'up');

  let banner = { cls: '', text: 'Loading…' };
  if (error) banner = { cls: 'down', text: 'Status service is unreachable' };
  else if (monitors && down) banner = { cls: 'down', text: `${down} system${down > 1 ? 's' : ''} down${reported ? ` · users reporting issues with ${reported} more` : ''}` };
  else if (monitors && reported) banner = { cls: 'warn', text: `Users are reporting issues with ${reported} system${reported > 1 ? 's' : ''}` };
  else if (allUp) banner = { cls: 'up', text: 'All systems operational' };
  else if (monitors) banner = { cls: '', text: active.length ? 'Waiting for first checks…' : 'No systems are being monitored yet' };

  const list = monitors ? (sort === 'affected' ? sortMostAffected(monitors) : sortByName(monitors)) : [];

  return (
    <section>
      <div className="page-header">
        <h1>System status</h1>
        <div className="status-meta">
          {updatedAt && <span className="muted small">Updated {updatedAt.toLocaleTimeString()}</span>}
          <LiveIndicator />
          {monitors?.length > 0 && (
            <button className="btn btn-small" onClick={() => setSubscribing({ preselect: null })}>🔔 Get notified</button>
          )}
        </div>
      </div>
      <div className={`status-banner ${banner.cls}`}>{banner.text}</div>

      {monitors && monitors.length > 0 && (
        <div className="toolbar">
          <h2 className="toolbar-title">{sort === 'affected' ? 'Most affected right now' : 'All services'}</h2>
          <label className="sort">
            <span className="muted small">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="affected">Most affected</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
      )}

      <div className="mgrid">
        {list.map((m) => (
          <MonitorCard key={m.id} m={m} onReport={setReporting} onSubscribe={(mon) => setSubscribing({ preselect: mon })} />
        ))}
      </div>

      {subscribing && (
        <SubscribeDialog monitors={sortByName(monitors || [])} preselect={subscribing.preselect} onClose={() => setSubscribing(null)} />
      )}

      {reporting && (
        <ReportDialog monitor={reporting} onClose={() => setReporting(null)} onReported={() => setUpdatedAt(new Date())} />
      )}

      {monitors && (
        <div className="card">
          <h2>Incidents in the last 14 days</h2>
          {incidents.length === 0 ? (
            <p className="muted">No incidents.</p>
          ) : (
            <ul className="status-list">
              {incidents.map((i) => (
                <li key={i.id} className="status-row-top">
                  <div>
                    <strong>{i.monitorName}</strong> <span className="env">{i.environment}</span>
                    <div className="muted small">{new Date(i.startedAt).toLocaleString()}</div>
                  </div>
                  {i.status === 'open'
                    ? <span className="status status-down">Ongoing</span>
                    : <span className="muted small">Resolved after {formatDuration(i.durationMs)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
