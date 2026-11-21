import { useState } from 'react';

const W = 300;          // viewBox width; the SVG stretches to the card width
const LINE_H = 44;      // height of the response-time area
const MARK_Y = 50;      // row for failure / report marks
const H = 58;

const timeLabel = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Last-24h sparkline: response time (line), failed checks (red marks) and user reports
 * (amber marks) per 30-minute slot. Hover/focus a slot for the exact numbers.
 */
export default function Sparkline({ data = [], name }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return <div className="spark-empty muted small">No data yet</div>;

  const n = data.length;
  const slotW = W / n;
  const values = data.map((d) => d.avgMs).filter((v) => v != null);
  const max = Math.max(50, ...values) * 1.15;
  const x = (i) => i * slotW + slotW / 2;
  const y = (v) => LINE_H - (v / max) * (LINE_H - 4);

  // Break the line where a slot has no successful checks.
  const segments = [];
  let current = [];
  data.forEach((d, i) => {
    if (d.avgMs == null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(`${x(i).toFixed(1)},${y(d.avgMs).toFixed(1)}`);
  });
  if (current.length) segments.push(current);

  const totalFailed = data.reduce((s, d) => s + d.failed, 0);
  const totalReports = data.reduce((s, d) => s + d.reports, 0);
  const h = hover != null ? data[hover] : null;

  return (
    <div className="spark">
      <div className="spark-title muted small">Last 24 hours</div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`${name}: last 24 hours. ${values.length ? `Average response ${Math.round(values.reduce((a, b) => a + b, 0) / values.length)} ms. ` : ''}${totalFailed} failed checks, ${totalReports} user reports.`}
        onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={LINE_H} y2={LINE_H} className="spark-axis" />
        {segments.map((pts, i) =>
          pts.length === 1
            ? <circle key={i} cx={pts[0].split(',')[0]} cy={pts[0].split(',')[1]} r="1.5" className="spark-dot" />
            : <polyline key={i} points={pts.join(' ')} className="spark-line" />
        )}
        {data.map((d, i) => (
          <g key={d.t}>
            {d.failed > 0 && <rect x={i * slotW + 0.5} y={MARK_Y} width={Math.max(slotW - 1, 1)} height="3" rx="1" className="spark-fail" />}
            {d.reports > 0 && <rect x={i * slotW + 0.5} y={MARK_Y + 4} width={Math.max(slotW - 1, 1)} height="3" rx="1" className="spark-report" />}
          </g>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} className="spark-cross" />}
        {/* Hit targets: the whole slot column, bigger than the marks */}
        {data.map((d, i) => (
          <rect key={`hit-${d.t}`} x={i * slotW} y="0" width={slotW} height={H} fill="transparent"
            onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {h && (
        <div className="spark-tip" style={{ left: `${Math.min(Math.max((x(hover) / W) * 100, 15), 85)}%` }}>
          <strong>{timeLabel(h.t)}–{timeLabel(new Date(new Date(h.t).getTime() + 30 * 60000).toISOString())}</strong>
          <div>{h.avgMs != null ? `${h.avgMs} ms avg` : 'no successful checks'}</div>
          {h.total > 0 && <div>{h.failed} of {h.total} checks failed</div>}
          {h.reports > 0 && <div>{h.reports} user report{h.reports > 1 ? 's' : ''}</div>}
        </div>
      )}
      <div className="spark-key muted small">
        <span><i className="key-line" />response time</span>
        <span><i className="key-fail" />failed checks</span>
        <span><i className="key-report" />reports</span>
      </div>
    </div>
  );
}
