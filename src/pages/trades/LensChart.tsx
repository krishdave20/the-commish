import { scaleLinear } from 'd3';
import { formatCount, formatOdds } from '../../app/format';
import { useWidth } from '../../components/charts/useWidth';
import { useGrown, useReducedMotion } from '../../components/motion';
import { LENS_STRONG, type LensLabel, type LensTeam } from '../../engine/dynasty/index.ts';

const M = { t: 18, r: 14, b: 38, l: 38 };

/** Dot colour by quadrant: green for contenders, gold for the two lopsided teams, grey for rebuilders. */
const LENS_COLOR: Record<LensLabel, string> = {
  contender: 'var(--green)', 'all-in': 'var(--gold)', retool: 'var(--gold)', rebuilder: 'var(--ink-3)',
};

interface Props {
  teams: LensTeam[];
  name: (rid: number) => string;
  meRid: number;
  width?: number;
  height?: number;
}

/** Every team on win-now strength (across) against future strength (up). The four quadrants are the four labels; your dot is
    larger and named. The table beside it carries every team's numbers. */
export function LensChart({ teams, name, meRid, width: fallback = 520, height = 320 }: Props) {
  const [ref, width] = useWidth(fallback);
  const grown = useGrown();
  const reduced = useReducedMotion();
  // a little room past 0 and 1 so the best and worst teams are not cut by the frame
  const x = scaleLinear().domain([-0.04, 1.04]).range([M.l, width - M.r]);
  const y = scaleLinear().domain([-0.04, 1.04]).range([height - M.b, M.t]);
  const mid = LENS_STRONG;
  const corner: Array<[LensLabel, number, number, 'start' | 'end']> = [
    ['retool', M.l + 6, M.t + 11, 'start'], ['contender', width - M.r - 6, M.t + 11, 'end'],
    ['rebuilder', M.l + 6, height - M.b - 6, 'start'], ['all-in', width - M.r - 6, height - M.b - 6, 'end'],
  ];
  const me = teams.find((t) => t.rid === meRid);
  return (
    <div className="chart" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`} width="100%" role="img"
        aria-label={`Win-now strength against future strength for ${teams.length} teams${me ? `; you are a ${me.label}` : ''}`}
      >
        <rect x={M.l} y={M.t} width={width - M.l - M.r} height={height - M.t - M.b} fill="none" stroke="var(--rule)" />
        <line className="gl" x1={x(mid)} x2={x(mid)} y1={M.t} y2={height - M.b} strokeDasharray="3 3" />
        <line className="gl" x1={M.l} x2={width - M.r} y1={y(mid)} y2={y(mid)} strokeDasharray="3 3" />
        {corner.map(([label, cx, cy, anchor]) => (
          <text key={label} className="ax" x={cx} y={cy} textAnchor={anchor} opacity={0.7}>{label}</text>
        ))}
        <text className="ax" x={(M.l + width - M.r) / 2} y={height - 10} textAnchor="middle">win-now strength: playoff odds and expected points →</text>
        <text className="ax" transform={`translate(11 ${(M.t + height - M.b) / 2}) rotate(-90)`} textAnchor="middle">future strength: dynasty value and youth →</text>
        {[...teams].sort((a, b) => Number(a.rid === meRid) - Number(b.rid === meRid)).map((t, i) => {
          const mine = t.rid === meRid;
          return (
            <g
              key={t.rid} className="lens-dot" data-label={t.label} data-me={mine ? 'true' : undefined}
              style={{
                transformBox: 'fill-box', transformOrigin: 'center', opacity: grown ? 1 : 0, transform: `scale(${grown ? 1 : 0.2})`,
                transition: reduced ? undefined : `opacity 0.5s ease ${i * 30}ms, transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) ${i * 30}ms`,
              }}
            >
              <circle
                cx={x(t.nowScore)} cy={y(t.futureScore)} r={mine ? 7 : 5}
                fill={mine ? LENS_COLOR[t.label] : 'var(--sheet)'} stroke={LENS_COLOR[t.label]} strokeWidth={mine ? 2 : 1.5}
              />
              {mine && <circle cx={x(t.nowScore)} cy={y(t.futureScore)} r={11} fill="none" stroke="var(--ink)" strokeWidth={1} />}
              <title>{`${name(t.rid)}: ${t.label}. playoff odds ${formatOdds(t.playoffPct)}, ${formatCount(t.ptsRos)} expected points, dynasty value ${formatCount(t.value)}${t.youthShare !== null ? `, ${Math.round(t.youthShare * 100)}% of player value 26 or younger` : ''}`}</title>
              {mine && (
                <text
                  className="ax" x={x(t.nowScore) + (t.nowScore > 0.8 ? -14 : 14)} y={y(t.futureScore) + 3} fill="var(--ink)"
                  textAnchor={t.nowScore > 0.8 ? 'end' : 'start'}
                >
                  {name(t.rid)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
