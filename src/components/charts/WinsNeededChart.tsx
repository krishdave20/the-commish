import { max, scaleBand, scaleLinear, sum } from 'd3';
import { formatOdds } from '../../app/format';
import { useGrown, useReducedMotion } from '../motion';
import { useWidth } from './useWidth';

export interface WinsBucket {
  /** final wins in a simulated season */
  wins: number;
  /** simulated seasons that ended with this many wins */
  sims: number;
  /** of those, how many made the playoffs */
  made: number;
}

interface Props {
  buckets: WinsBucket[];
  /** width used until the container is measured */
  width?: number;
  height?: number;
}

const M = { t: 22, r: 8, b: 40, l: 34 };

/** P(playoffs | final wins = k) for my team. Rare outcomes are faded; each bar shows how many simulated seasons it rests on. */
export function WinsNeededChart({ buckets, width: fallbackWidth = 480, height = 210 }: Props) {
  const [ref, width] = useWidth(fallbackWidth);
  const grown = useGrown();
  const reduced = useReducedMotion();
  const data = [...buckets].filter((b) => b.sims > 0).sort((a, b) => a.wins - b.wins)
    .map((b) => ({ ...b, p: b.made / b.sims }));
  const total = sum(data, (d) => d.sims);
  if (data.length === 0) return <p className="note">No simulated seasons yet.</p>;

  const x = scaleBand<number>().domain(data.map((d) => d.wins)).range([M.l, width - M.r]).padding(0.22);
  const y = scaleLinear().domain([0, 1]).range([height - M.b, M.t]);
  const base = height - M.b;
  const biggest = max(data, (d) => d.sims) ?? 1;

  return (
    <div className="chart" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`} width="100%" role="img"
        aria-label={`Chance of making the playoffs by final win total, ${data[0].wins} to ${data[data.length - 1].wins} wins`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line className="gl" x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} />
            <text className="ax" x={M.l - 6} y={y(t) + 3} textAnchor="end">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {data.map((d, i) => {
          const bx = x(d.wins) ?? 0;
          const h = base - y(d.p);
          const share = d.sims / total;
          return (
            <g key={d.wins} className="wins-bar" data-wins={d.wins}>
              <rect
                className="wins-rect" x={bx} y={y(d.p)} width={x.bandwidth()} height={Math.max(0, h)} rx={2}
                fill={d.p >= 0.75 ? 'var(--green)' : d.p >= 0.35 ? 'var(--gold)' : 'var(--red)'}
                opacity={share < 0.01 ? 0.35 : 0.9}
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: '50% 100%',
                  transform: `scaleY(${grown ? 1 : 0})`,
                  transition: reduced ? undefined : `transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) ${i * 40}ms`,
                }}
              >
                <title>{`${d.wins} final wins: ${formatOdds(d.p)} make the playoffs, in ${d.made.toLocaleString('en-US')} of ${d.sims.toLocaleString('en-US')} simulated seasons (${(share * 100).toFixed(1)}%)`}</title>
              </rect>
              {share >= 0.02 && (
                <text className="ax" x={bx + x.bandwidth() / 2} y={y(d.p) - 6} textAnchor="middle" fill="var(--ink)">{formatOdds(d.p)}</text>
              )}
              <text className="ax" x={bx + x.bandwidth() / 2} y={height - 24} textAnchor="middle">{d.wins}W</text>
              <text
                className="ax sims" x={bx + x.bandwidth() / 2} y={height - 11} textAnchor="middle" fontSize={9}
                opacity={0.45 + 0.55 * (d.sims / biggest)}
              >
                {d.sims.toLocaleString('en-US')}
              </text>
            </g>
          );
        })}
        <text className="ax" x={M.l - 6} y={height - 11} textAnchor="end" fontSize={9}>sims</text>
      </svg>
    </div>
  );
}
