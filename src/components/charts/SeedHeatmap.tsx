import { useMemo } from 'react';
import { interpolateRgb, range, rgb, sum } from 'd3';
import { formatOdds, ordinal } from '../../app/format';
import { readToken } from '../../app/theme';
import { useTheme } from '../../app/useTheme';

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

/** The cells are drawn in JS (a d3 colour ramp), so the colours are read off the page's tokens and read again when the theme changes.
    The fallbacks are the light values, for a page that has no stylesheet (a test, a server render). */
const FALLBACK = { base: '#e9e4d8', green: '#2d5a27', gold: '#c4922a', red: '#8b3a1a', paper: '#f4f1eb', ink: '#1f1d19' };
function palette() {
  const t = (name: string, fb: string) => readToken(name, fb);
  const base = t('--rule-2', FALLBACK.base);
  const green = t('--green', FALLBACK.green), gold = t('--gold', FALLBACK.gold), red = t('--red', FALLBACK.red);
  return {
    green, gold, red,
    ramps: { green: interpolateRgb(base, green), gold: interpolateRgb(base, gold), red: interpolateRgb(base, red) },
    paper: t('--paper', FALLBACK.paper), ink: t('--ink', FALLBACK.ink),
  };
}
type Palette = ReturnType<typeof palette>;

const NAME_W = 150;
const CELL_W = 44;
const CELL_H = 24;
const GAP = 2;
const HEAD_H = 20;

/** Numbers on a cell are drawn in whichever of paper and ink (read off the tokens) reads better on its fill. */
function textOn(fill: string, paper: string, ink: string): string {
  const lum = (c: string) => {
    const { r, g, b } = rgb(c);
    const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const l = lum(fill);
  const contrast = (o: string) => { const m = lum(o); return (Math.max(l, m) + 0.05) / (Math.min(l, m) + 0.05); };
  return contrast(paper) >= contrast(ink) ? paper : ink;
}

function cellText(v: number): string {
  if (v < 0.01) return '';
  return v >= 0.995 ? '99' : String(Math.round(v * 100));
}

/** Teams by seeds: darker means likelier. Green cells are division-winner seeds, gold wild cards, red a miss. */
export function SeedHeatmap({ rows, divisionSeeds, showOut = true, sortRows = true }: Props) {
  const { resolved } = useTheme();
  const pal: Palette = useMemo(() => (resolved ? palette() : palette()), [resolved]);
  const nSeeds = rows.reduce((m, r) => Math.max(m, r.seeds.length), 0);
  const cols = nSeeds + (showOut ? 1 : 0);
  const ordered = sortRows ? [...rows].sort((a, b) => sum(b.seeds) - sum(a.seeds)) : rows;
  const width = NAME_W + cols * (CELL_W + GAP);
  const height = HEAD_H + ordered.length * (CELL_H + GAP);
  const colX = (i: number) => NAME_W + i * (CELL_W + GAP);

  const likeliest = ordered.length ? [...ordered].sort((a, b) => (b.seeds[0] ?? 0) - (a.seeds[0] ?? 0))[0] : null;
  const summary = `Seed odds by team.${likeliest && likeliest.seeds[0] !== undefined ? ` Likeliest 1st seed: ${likeliest.team}, ${formatOdds(likeliest.seeds[0])}.` : ''}`;

  return (
    <div className="heat-wrap">
      <div className="tw">
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
                const fill = (i < divisionSeeds ? pal.ramps.green : i < nSeeds ? pal.ramps.gold : pal.ramps.red)(k);
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
                      fill={textOn(fill, pal.paper, pal.ink)} pointerEvents="none"
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
      </div>
      <div className="sr-only">
      <table>
        <caption>{summary}</caption>
        <thead>
          <tr>
            <th scope="col">team</th>
            {range(nSeeds).map((i) => <th key={i} scope="col">{ordinal(i + 1)} seed</th>)}
            {showOut && <th scope="col">misses the playoffs</th>}
          </tr>
        </thead>
        <tbody>
          {ordered.map((r) => {
            const out = Math.max(0, 1 - sum(r.seeds));
            return (
              <tr key={r.id}>
                <th scope="row">{r.team}</th>
                {range(nSeeds).map((i) => <td key={i}>{formatOdds(r.seeds[i] ?? 0)}</td>)}
                {showOut && <td>{formatOdds(out)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="legend heat-legend">
        <span><span className="swatch" style={{ background: 'var(--green)' }} />division winner seeds</span>
        <span><span className="swatch" style={{ background: 'var(--gold)' }} />wild cards</span>
        {showOut && <span><span className="swatch" style={{ background: 'var(--red)' }} />misses the playoffs</span>}
      </div>
    </div>
  );
}
