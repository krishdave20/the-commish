import { area, curveMonotoneX, line, max, min, scaleBand, scaleLinear } from 'd3';
import { useGrown, useReducedMotion } from '../motion';
import { useWidth } from './useWidth';

export interface WeekProjection {
  week: number;
  /** projection; leave out (null) for a finished week that has only an actual */
  expected?: number | null;
  floor?: number | null;
  ceiling?: number | null;
  /** actual points for a completed week */
  actual?: number | null;
  /** fantasy playoff week: shaded */
  playoff?: boolean;
}

interface Props {
  weeks: WeekProjection[];
  /** width used until the container is measured */
  width?: number;
  height?: number;
}

const M = { t: 16, r: 12, b: 26, l: 36 };

/** Expected points per week with a floor-to-ceiling band, actual points for finished weeks, and playoff weeks shaded. */
export function WeeklyProjectionChart({ weeks, width: fallbackWidth = 640, height = 220 }: Props) {
  const [ref, width] = useWidth(fallbackWidth);
  const grown = useGrown();
  const reduced = useReducedMotion();
  if (weeks.length === 0) return <p className="note">No weeks to chart yet.</p>;

  const x = scaleBand<number>().domain(weeks.map((w) => w.week)).range([M.l, width - M.r]);
  const cx = (w: number) => (x(w) ?? 0) + x.bandwidth() / 2;
  const has = (w: WeekProjection): w is WeekProjection & { expected: number; floor: number; ceiling: number } =>
    w.expected != null && w.floor != null && w.ceiling != null;
  const lows = weeks.flatMap((w) => [w.floor ?? Infinity, w.expected ?? Infinity, w.actual ?? Infinity]);
  const highs = weeks.flatMap((w) => [w.ceiling ?? -Infinity, w.expected ?? -Infinity, w.actual ?? -Infinity]);
  const y = scaleLinear()
    .domain([Math.floor(((min(lows.filter(Number.isFinite)) ?? 0) - 6) / 10) * 10, Math.ceil(((max(highs.filter(Number.isFinite)) ?? 100) + 6) / 10) * 10])
    .range([height - M.b, M.t]);

  const expected = line<WeekProjection>().defined(has).x((w) => cx(w.week)).y((w) => y(w.expected as number)).curve(curveMonotoneX)(weeks) ?? '';
  const band = area<WeekProjection>().defined(has).x((w) => cx(w.week)).y0((w) => y(w.floor as number)).y1((w) => y(w.ceiling as number)).curve(curveMonotoneX)(weeks) ?? '';
  const playoff = weeks.filter((w) => w.playoff);
  const finished = weeks.filter((w) => w.actual !== null && w.actual !== undefined);

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`Weekly projection for weeks ${weeks[0].week} to ${weeks[weeks.length - 1].week}`}>
        {playoff.map((w) => (
          <rect key={`po${w.week}`} className="po-shade" x={x(w.week)} y={M.t} width={x.bandwidth()} height={height - M.t - M.b} fill="var(--gold-soft)" />
        ))}
        {playoff.length > 0 && (
          <text className="ax" x={(x(playoff[0].week) ?? 0) + (playoff.length * x.bandwidth()) / 2} y={M.t + 10} textAnchor="middle">playoffs</text>
        )}
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line className="gl" x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} />
            <text className="ax" x={M.l - 6} y={y(t) + 3} textAnchor="end">{t}</text>
          </g>
        ))}
        {weeks.map((w) => <text key={w.week} className="ax" x={cx(w.week)} y={height - 8} textAnchor="middle">{w.week}</text>)}
        <path className="band" d={band} fill="var(--green-soft)" opacity={0.8} />
        <path
          className="expected" d={expected} fill="none" stroke="var(--green)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
          pathLength={1}
          style={reduced ? undefined : { strokeDasharray: 1, strokeDashoffset: grown ? 0 : 1, transition: 'stroke-dashoffset 0.9s cubic-bezier(0.2, 0.7, 0.2, 1)' }}
        />
        {weeks.filter(has).map((w) => (
          <circle key={`e${w.week}`} className="exp-dot" cx={cx(w.week)} cy={y(w.expected)} r={2.4} fill="var(--green)">
            <title>{`Week ${w.week}: expected ${w.expected.toFixed(1)}, floor ${w.floor.toFixed(1)}, ceiling ${w.ceiling.toFixed(1)}${w.playoff ? ' (playoffs)' : ''}`}</title>
          </circle>
        ))}
        {finished.map((w) => (
          <circle key={`a${w.week}`} className="actual-dot" cx={cx(w.week)} cy={y(w.actual as number)} r={3.6} fill="var(--ink)" stroke="var(--sheet)" strokeWidth={1.2}>
            <title>{`Week ${w.week}: scored ${(w.actual as number).toFixed(1)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="legend">
        <span><span className="swatch" style={{ background: 'var(--green)' }} />expected</span>
        <span><span className="swatch" style={{ background: 'var(--green-soft)' }} />floor to ceiling</span>
        <span><span className="swatch dot" style={{ background: 'var(--ink)' }} />actual</span>
      </div>
    </div>
  );
}
