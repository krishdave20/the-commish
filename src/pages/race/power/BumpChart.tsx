import { curveBumpX, line, scalePoint, scaleLinear } from 'd3';
import type { KeyboardEvent } from 'react';
import { useReducedMotion, useGrown } from '../../../components/motion';
import { useWidth } from '../../../components/charts/useWidth';
import type { BumpData } from '../../../engine/power';
import { describeSeries } from './describe';

interface Props {
  data: BumpData;
  /** the team highlighted by default (yours) */
  meRid: number;
  /** the team under the pointer or focus, or the one tapped */
  activeRid: number | null;
  /** the week whose rankings the list shows */
  selectedWeek: number;
  onHover: (rid: number | null) => void;
  onPick: (rid: number) => void;
  width?: number;
}

const ROW = 24;
const M = { t: 14, b: 26, l: 26 };
const NAME_ROOM = 118;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A bump chart: each team's rank by week, best at the top. Your team is the strong green line; hover, focus or tap any line to bring that team forward.
    The lines draw in once (not at all with reduced motion). */
export function BumpChart({ data, meRid, activeRid, selectedWeek, onHover, onPick, width: fallbackWidth = 640 }: Props) {
  const [ref, width] = useWidth(fallbackWidth);
  const grown = useGrown();
  const reduced = useReducedMotion();
  const { weeks, teams, series } = data;
  if (weeks.length < 2 || teams === 0) return <p className="note">the chart starts once there are two weeks of rankings.</p>;

  const names = width >= 520;
  const right = names ? NAME_ROOM : 14;
  const height = M.t + M.b + (teams - 1) * ROW + 8;
  const x = scalePoint<number>().domain(weeks).range([M.l + 10, width - right]);
  const y = scaleLinear().domain([1, teams]).range([M.t, M.t + (teams - 1) * ROW]);
  const path = line<{ week: number; rank: number }>().x((p) => x(p.week) ?? 0).y((p) => y(p.rank)).curve(curveBumpX);

  const focus = activeRid ?? meRid;
  // dimmed teams first, the highlighted one last so it sits on top
  const ordered = [...series].sort((a, b) => Number(a.rid === focus) - Number(b.rid === focus) || Number(a.rid === meRid) - Number(b.rid === meRid));
  const sx = x(selectedWeek);

  const key = (e: KeyboardEvent, rid: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(rid); }
  };

  return (
    <div className="chart pw-chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="group" aria-label={`rank by week for ${teams} teams, best at the top`} onMouseLeave={() => onHover(null)}>
        {sx !== undefined && <rect className="pw-col" x={sx - 14} y={M.t - 10} width={28} height={(teams - 1) * ROW + 20} rx={6} />}
        {Array.from({ length: teams }, (_, i) => i + 1).map((r) => (
          <g key={r}>
            <line className="gl" x1={M.l} x2={width - right + 6} y1={y(r)} y2={y(r)} />
            <text className="ax" x={M.l - 8} y={y(r) + 3} textAnchor="end">{r}</text>
          </g>
        ))}
        {weeks.map((w) => <text key={w} className="ax" x={x(w) ?? 0} y={height - 8} textAnchor="middle">{w}</text>)}
        {ordered.map((s, i) => {
          const isFocus = s.rid === focus, isMe = s.rid === meRid;
          const state = isFocus ? 'focus' : isMe ? 'me' : 'rest';
          const d = path(s.points) ?? '';
          const lastPt = s.points[s.points.length - 1]!;
          return (
            <g
              key={s.rid} className="pw-line" data-state={state} data-rid={s.rid} data-me={isMe || undefined}
              role="button" tabIndex={0} aria-pressed={activeRid === s.rid} aria-label={describeSeries(s)}
              onMouseEnter={() => onHover(s.rid)} onFocus={() => onHover(s.rid)} onBlur={() => onHover(null)}
              onClick={() => onPick(s.rid)} onKeyDown={(e) => key(e, s.rid)}
            >
              <path className="pw-hit" d={d} />
              <path
                className="pw-stroke" d={d} pathLength={1}
                style={{
                  strokeDasharray: 1, strokeDashoffset: grown ? 0 : 1,
                  transition: reduced ? undefined : `stroke-dashoffset var(--t-slow) var(--ease) ${Math.min(i, 8) * 40}ms, opacity var(--t-fast) var(--ease), stroke-width var(--t-fast) var(--ease)`,
                }}
              />
              {s.points.map((p) => <circle key={p.week} className="pw-dot" cx={x(p.week) ?? 0} cy={y(p.rank)} r={isFocus ? 4.5 : 3} />)}
              {names && <text className="pw-name" x={(x(lastPt.week) ?? 0) + 10} y={y(lastPt.rank) + 4}>{clip(s.team, 17)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
