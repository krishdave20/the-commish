import { interpolateRgb, range, sum } from 'd3';
import { ordinal } from '../../app/format';

export interface SeedRow {
  id: string | number;
  team: string;
  /** P(finishing at seed k) for k = 1..N, each from 0 to 1 */
  seeds: number[];
  isMe?: boolean;
}

interface Props {
  rows: SeedRow[];
  /** how many of the top seeds go to division winners (they are drawn green) */
  divisionSeeds: number;
  /** add a final "Out" column: the chance of missing the playoffs (default true) */
  showOut?: boolean;
  /** order teams by total playoff chance, best first (default true) */
  sortRows?: boolean;
}

const GREEN = interpolateRgb('#e9e4d8', '#2d5a27');
const GOLD = interpolateRgb('#e9e4d8', '#c4922a');
const RED = interpolateRgb('#e9e4d8', '#8b3a1a');

const NAME_W = 150;
const CELL_W = 44;
const CELL_H = 24;
const GAP = 2;
const HEAD_H = 20;

function cellText(v: number): string {
  if (v < 0.01) return '';
  return v >= 0.995 ? '99' : String(Math.round(v * 100));
}

/** Teams by seeds: darker means likelier. Green cells are division-winner seeds, gold wild cards, red a miss. */
export function SeedHeatmap({ rows, divisionSeeds, showOut = true, sortRows = true }: Props) {
  const nSeeds = rows.reduce((m, r) => Math.max(m, r.seeds.length), 0);
  const cols = nSeeds + (showOut ? 1 : 0);
  const ordered = sortRows ? [...rows].sort((a, b) => sum(b.seeds) - sum(a.seeds)) : rows;
  const width = NAME_W + cols * (CELL_W + GAP);
  const height = HEAD_H + ordered.length * (CELL_H + GAP);
  const colX = (i: number) => NAME_W + i * (CELL_W + GAP);

  return (
    <div className="tw heat-wrap">
      <svg
        className="heat" viewBox={`0 0 ${width} ${height}`} width={width} height={height}
        role="img" aria-label={`Seed odds for ${ordered.length} teams`}
      >
        {range(nSeeds).map((i) => (
          <text
            key={`h${i}`} className="ax heat-head" data-division={i < divisionSeeds ? 'true' : undefined}
            x={colX(i) + CELL_W / 2} y={13} textAnchor="middle"
            fontWeight={i < divisionSeeds ? 500 : 400}
          >
            {ordinal(i + 1)}
          </text>
        ))}
        {showOut && <text className="ax heat-head" x={colX(nSeeds) + CELL_W / 2} y={13} textAnchor="middle">Out</text>}

        {ordered.map((r, ri) => {
          const y = HEAD_H + ri * (CELL_H + GAP);
          const out = Math.max(0, 1 - sum(r.seeds));
          const values = showOut ? [...r.seeds, out] : r.seeds;
          return (
            <g key={r.id} data-team={r.team}>
              <text x={0} y={y + CELL_H / 2 + 4} className="heat-name" fontWeight={r.isMe ? 500 : 400}>
                {r.team.length > 20 ? `${r.team.slice(0, 19)}…` : r.team}
                <title>{r.team}</title>
              </text>
              {values.map((v, i) => {
                const k = Math.pow(Math.min(1, Math.max(0, v)), 0.6);
                const fill = (i < divisionSeeds ? GREEN : i < nSeeds ? GOLD : RED)(k);
                const what = i < nSeeds ? `${ordinal(i + 1)} seed` : 'miss playoffs';
                return (
                  <g key={i}>
                    <rect
                      className="heat-cell" x={colX(i)} y={y} width={CELL_W} height={CELL_H} rx={2} fill={fill}
                      data-kind={i < divisionSeeds ? 'division' : i < nSeeds ? 'wildcard' : 'out'}
                    >
                      <title>{`${r.team}: ${what} ${(v * 100).toFixed(1)}%`}</title>
                    </rect>
                    <text
                      x={colX(i) + CELL_W / 2} y={y + CELL_H / 2 + 4} textAnchor="middle" className="heat-val"
                      fill={k > 0.55 ? '#faf8f3' : '#1f1d19'} pointerEvents="none"
                    >
                      {cellText(v)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="legend heat-legend">
        <span><span className="swatch" style={{ background: '#2d5a27' }} />division winner seeds</span>
        <span><span className="swatch" style={{ background: '#c4922a' }} />wild cards</span>
        {showOut && <span><span className="swatch" style={{ background: '#8b3a1a' }} />misses the playoffs</span>}
      </div>
    </div>
  );
}
