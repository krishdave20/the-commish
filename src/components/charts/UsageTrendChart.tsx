import { extent, line, max, scaleLinear } from 'd3';
import { useGrown, useReducedMotion } from '../motion';
import { useWidth } from './useWidth';

export interface TrendPoint {
  week: number;
  /** a fraction (0.62 is 62%); null when there is no value that week */
  value: number | null;
  /** the sample behind the value (snaps, targets …), shown in the tooltip */
  n?: number;
}

export interface TrendSeries {
  id: string;
  label: string;
  /** what `n` counts, for the tooltip: "snaps", "targets" … */
  unit?: string;
  color: string;
  points: TrendPoint[];
}

interface Props {
  series: TrendSeries[];
  width?: number;
  height?: number;
  /** what the values are, for the accessible name */
  label: string;
}

const M = { t: 12, r: 14, b: 26, l: 38 };

/** Weekly percentages as lines, one per series (snap %, target share, air-yards share, red-zone share). */
export function UsageTrendChart({ series, width: fallbackWidth = 560, height = 200, label }: Props) {
  const [ref, width] = useWidth(fallbackWidth);
  const grown = useGrown();
  const reduced = useReducedMotion();
  const all = series.flatMap((s) => s.points.filter((p) => p.value !== null));
  if (all.length === 0) return <p className="note">no weekly values yet.</p>;

  const [w0, w1] = extent(series.flatMap((s) => s.points.map((p) => p.week))) as [number, number];
  const top = Math.min(1, Math.max(0.2, Math.ceil(((max(all, (p) => p.value as number) ?? 0.5) + 0.05) * 10) / 10));
  const x = scaleLinear().domain([w0, w1 === w0 ? w0 + 1 : w1]).range([M.l, width - M.r]);
  const y = scaleLinear().domain([0, top]).range([height - M.b, M.t]);
  const weeks = [...new Set(series.flatMap((s) => s.points.map((p) => p.week)))].sort((a, b) => a - b);

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line className="gl" x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} />
            <text className="ax" x={M.l - 6} y={y(t) + 3} textAnchor="end">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {weeks.map((w) => <text key={w} className="ax" x={x(w)} y={height - 8} textAnchor="middle">{w}</text>)}
        {series.map((s) => {
          const pts = s.points.filter((p) => p.value !== null);
          const d = line<TrendPoint>().defined((p) => p.value !== null).x((p) => x(p.week)).y((p) => y(p.value as number))(s.points) ?? '';
          return (
            <g key={s.id} className="trend" data-series={s.id}>
              <path
                className="trend-line" d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" pathLength={1}
                style={reduced ? undefined : { strokeDasharray: 1, strokeDashoffset: grown ? 0 : 1, transition: 'stroke-dashoffset 0.9s cubic-bezier(0.2, 0.7, 0.2, 1)' }}
              />
              {pts.map((p) => (
                <circle key={p.week} className="trend-dot" cx={x(p.week)} cy={y(p.value as number)} r={3} fill={s.color}>
                  <title>{`${s.label}, week ${p.week}: ${(100 * (p.value as number)).toFixed(1)}%${p.n !== undefined ? ` (${p.n} ${s.unit ?? 'plays'})` : ''}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {series.map((s) => <span key={s.id}><span className="swatch" style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
}
