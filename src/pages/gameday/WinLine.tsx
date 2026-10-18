import { curveMonotoneX, extent, line, scaleLinear } from 'd3';
import { formatClockTime } from '../../app/live/format';
import { formatOdds } from '../../app/format';
import { useWidth } from '../../components/charts/useWidth';

export interface WinPoint { clock: number; p: number }

interface Props {
  points: WinPoint[];
  /** the left team's pre-game chance, drawn as a dashed line */
  pre: number;
  name: string;
  height?: number;
}

const M = { t: 8, r: 8, b: 22, l: 36 };

/** Win chance over the session's polls: a thin line from 0 to 100% with the 50% rule and the pre-game level. */
export function WinLine({ points, pre, name, height = 112 }: Props) {
  const [ref, width] = useWidth(640);
  if (points.length < 2) {
    return <p className="note">the line starts once there are two updates.</p>;
  }
  const [t0, t1] = extent(points, (d) => d.clock) as [number, number];
  const x = scaleLinear().domain([t0, t1 === t0 ? t0 + 1 : t1]).range([M.l, width - M.r]);
  const y = scaleLinear().domain([0, 1]).range([height - M.b, M.t]);
  const d = line<WinPoint>().x((p) => x(p.clock)).y((p) => y(p.p)).curve(curveMonotoneX)(points) ?? '';
  const last = points[points.length - 1]!;
  return (
    <div className="chart gd-line" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`} width="100%" role="img"
        aria-label={`${name} win chance over time: started at ${formatOdds(points[0]!.p)}, now ${formatOdds(last.p)}`}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line className="gl" x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} strokeDasharray={t === 0.5 ? undefined : '2 4'} />
            <text className="ax" x={M.l - 6} y={y(t) + 3} textAnchor="end">{Math.round(t * 100)}%</text>
          </g>
        ))}
        <line x1={M.l} x2={width - M.r} y1={y(pre)} y2={y(pre)} stroke="var(--gold)" strokeWidth={1} strokeDasharray="4 4" />
        <path d={d} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(last.clock)} cy={y(last.p)} r={3.5} fill="var(--green)" stroke="var(--sheet)" strokeWidth={1.5} />
        <text className="ax" x={M.l} y={height - 6}>{formatClockTime(t0)}</text>
        <text className="ax" x={width - M.r} y={height - 6} textAnchor="end">{formatClockTime(t1)}</text>
      </svg>
    </div>
  );
}
