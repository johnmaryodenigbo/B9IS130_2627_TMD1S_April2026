import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { monitorsApi, incidentsApi, ROLES } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge, { ReportsBadge } from '../components/StatusBadge.jsx';
import { REPORT_CATEGORIES } from '../api/client.js';
import SslBadge, { sslDaysLeft } from '../components/SslBadge.jsx';
import LiveIndicator from '../components/LiveIndicator.jsx';
import { OpenIncidents, IncidentHistory } from '../components/IncidentList.jsx';
import { useLiveMonitors } from '../hooks/useLiveMonitors.js';
import { useSocketEvent } from '../hooks/useSocket.js';

const categoryLabel = (c) => REPORT_CATEGORIES.find((x) => x.value === c)?.label || c;

// One monitor with a spike of user reports, plus what users say is wrong (last hour).
function ReportedRow({ m, onCheckNow, busy }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    monitorsApi.reports(m.id, 1).then(setSummary).catch(() => {});
  }, [m.id, m.reportsRecent]);
  return (
    <li className="status-row-top">
      <div>
        <strong>{m.name}</strong> <span className="env">{m.environment}</span>
        <div className="small">{m.reportsRecent} reports in 15 min · checks: {m.status}</div>
        {summary?.categories?.length > 0 && (
          <div className="muted small">Last hour: {summary.categories.map((c) => `${categoryLabel(c.category)} ${c.count}`).join(' · ')}</div>
        )}
      </div>
      <div className="status-meta">
        <button className="btn btn-small btn-ghost" disabled={busy} onClick={onCheckNow}>{busy ? 'Checking…' : 'Check now'}</button>
        <ReportsBadge monitor={m} />
      </div>
    </li>
  );
}

const FALLBACK_REFRESH_MS = 60000; // safety net; normal updates arrive live over Socket.IO

// SRE home: open incidents (acknowledge, check now), monitor counts and incident history. Live.
export default function OnCall() {
  const { user } = useAuth();
  const [monitors, setMonitors] = useState(null);
  const [openIncidents, setOpenIncidents] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loadMonitors = useCallback(
    () => monitorsApi.list({ active: 'true' }).then(({ monitors }) => setMonitors(monitors)),
    []
  );
  const loadIncidents = useCallback(
    () =>
      Promise.all([
        incidentsApi.list({ status: 'open' }).then(({ incidents }) => setOpenIncidents(incidents)),
        incidentsApi.list({ status: 'resolved', limit: 20 }).then(({ incidents }) => setHistory(incidents)),
      ]),
    []
  );
  const load = useCallback(
    () => Promise.all([loadMonitors(), loadIncidents()]).then(() => setError('')).catch((e) => setError(e.message)),
    [loadMonitors, loadIncidents]
  );

  useEffect(() => {
    load();
    const id = setInterval(load, FALLBACK_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useLiveMonitors({ monitors, setMonitors, refetch: loadMonitors });

  // Incidents change when alerts are sent, acknowledged or resolved: refetch shortly after.
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useSocketEvent('incident:update', () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => loadIncidents().catch(() => {}), 500);
  });

  const run = async (id, fn) => {
    setBusyId(id);
    try { await fn(); await load(); } catch (e) { setError(e.message); }
    setBusyId(null);
  };

  const degraded = (monitors || []).filter((m) => m.status === 'up' && m.consecutiveFailures > 0);
  const reported = (monitors || []).filter((m) => m.reportStatus === 'elevated');
  // Certificates that expire within 30 days, have expired, or aren't trusted
  const certIssues = (monitors || [])
    .filter((m) => m.sslCheckedAt && (m.sslValidTo == null || sslDaysLeft(m) <= 30 || m.sslTrusted === false))
    .sort((a, b) => (sslDaysLeft(a) ?? -999) - (sslDaysLeft(b) ?? -999));
  const up = (monitors || []).filter((m) => m.status === 'up').length;
  const down = (monitors || []).filter((m) => m.status === 'down').length;

  return (
    <section>
      <div className="page-header">
        <h1>Welcome, {user.name}</h1>
        <LiveIndicator />
      </div>
      {error && <p className="error card">{error}</p>}

      <div className="stats">
        <div className="card stat"><span className="stat-value">{monitors ? monitors.length : '—'}</span><span className="muted">active monitors</span></div>
        <div className="card stat"><span className="stat-value ok-text">{monitors ? up : '—'}</span><span className="muted">up</span></div>
        <div className="card stat"><span className={`stat-value ${down ? 'error-text' : ''}`}>{monitors ? down : '—'}</span><span className="muted">down</span></div>
      </div>

      <div className="card">
        <h2>Open incidents {openIncidents.length > 0 && <span className="count">{openIncidents.length}</span>}</h2>
        <OpenIncidents
          incidents={openIncidents}
          busyId={busyId}
          onAcknowledge={(id) => run(id, () => incidentsApi.acknowledge(id))}
          onCheckNow={(monitorId) => run(monitorId, () => monitorsApi.checkNow(monitorId))}
        />
      </div>

      {reported.length > 0 && (
        <div className="card">
          <h2>Users reporting issues</h2>
          <p className="muted small">Visitors of the status page are reporting problems well above the usual level, even if checks pass.</p>
          <ul className="status-list">
            {reported.map((m) => (
              <ReportedRow key={m.id} m={m} onCheckNow={() => run(m.id, () => monitorsApi.checkNow(m.id))} busy={busyId === m.id} />
            ))}
          </ul>
        </div>
      )}

      {certIssues.length > 0 && (
        <div className="card">
          <h2>SSL certificates needing attention</h2>
          <ul className="status-list">
            {certIssues.map((m) => (
              <li key={m.id} className="status-row-top">
                <div>
                  <strong>{m.name}</strong> <span className="env">{m.environment}</span>
                  <div className="mono small muted">{m.url}</div>
                  <div className="small">
                    {m.sslValidTo ? `Expires ${new Date(m.sslValidTo).toLocaleDateString()}` : 'Could not read the certificate'}
                    {m.sslIssuer && ` · ${m.sslIssuer}`}
                    {m.sslError && <span className="error-text"> · {m.sslError}</span>}
                  </div>
                </div>
                <SslBadge monitor={m} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {degraded.length > 0 && (
        <div className="card">
          <h2>Failing, not down yet</h2>
          <p className="muted small">These failed their last check but haven't reached the failure threshold.</p>
          <ul className="status-list">
            {degraded.map((m) => (
              <li key={m.id} className="status-row-top">
                <div><strong>{m.name}</strong> <span className="env">{m.environment}</span>
                  <div className="error-text small">{m.lastError}</div></div>
                <StatusBadge status="pending" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Recent incidents</h2>
        <IncidentHistory incidents={history} />
      </div>

      <p className="muted small">
        {user.role === ROLES.SRE
          ? user.onCall !== false
            ? <>You are <strong>on call</strong>: downtime emails go to {user.email}. </>
            : <>You are <strong>not on call</strong> and won't get downtime emails. </>
          : <>Admins get downtime emails only when no SRE is on call. </>}
        Change this in <Link to="/account">Account</Link>. See all <Link to="/monitors">monitors</Link>.
      </p>
    </section>
  );
}
