import { useMemo } from 'react';
import { formatPoints1 } from '../../app/format';
import type { ModelExtras } from '../../app/loadModel';
import { makeScorer } from '../../engine';
import type { StatLine } from '../../data';

interface Col { key: string; label: string; get: (s: StatLine) => number | null; digits?: number }

const n = (s: StatLine, k: string) => (typeof s[k] === 'number' ? s[k]! : 0);

const COLS: Col[] = [
  { key: 'pass_att', label: 'pass att', get: (s) => n(s, 'pass_att') },
  { key: 'pass_cmp', label: 'cmp', get: (s) => n(s, 'pass_cmp') },
  { key: 'pass_yd', label: 'pass yds', get: (s) => n(s, 'pass_yd') },
  { key: 'pass_td', label: 'pass td', get: (s) => n(s, 'pass_td') },
  { key: 'pass_int', label: 'int', get: (s) => n(s, 'pass_int') },
  { key: 'rush_att', label: 'carries', get: (s) => n(s, 'rush_att') },
  { key: 'rush_yd', label: 'rush yds', get: (s) => n(s, 'rush_yd') },
  { key: 'rush_td', label: 'rush td', get: (s) => n(s, 'rush_td') },
  { key: 'rec_tgt', label: 'targets', get: (s) => n(s, 'rec_tgt') },
  { key: 'rec', label: 'rec', get: (s) => n(s, 'rec') },
  { key: 'rec_yd', label: 'rec yds', get: (s) => n(s, 'rec_yd') },
  { key: 'rec_td', label: 'rec td', get: (s) => n(s, 'rec_td') },
  { key: 'fgm', label: 'fg made', get: (s) => n(s, 'fgm') },
  { key: 'xpm', label: 'xp made', get: (s) => n(s, 'xpm') },
  { key: 'sack', label: 'sacks', get: (s) => n(s, 'sack') },
  { key: 'int', label: 'ints', get: (s) => n(s, 'int') },
  { key: 'pts_allow', label: 'pts allowed', get: (s) => n(s, 'pts_allow') },
];

/** Weekly Sleeper stat lines, with fantasy points scored by this league's settings. */
export function GameLogCard({ pid, extras, currentWeek }: { pid: string; extras: ModelExtras; currentWeek: number }) {
  const view = useMemo(() => {
    const score = makeScorer(extras.scoring);
    const weeks = Object.keys(extras.stats).map(Number).sort((a, b) => a - b);
    const rows = weeks.flatMap((w) => {
      const line = extras.stats[w]?.[pid];
      if (!line) return [];
      const snaps = n(line, 'off_snp'), team = n(line, 'tm_off_snp');
      return [{ week: w, line, pts: score(line), snapPct: team > 0 ? snaps / team : null, snaps, team }];
    });
    const cols = COLS.filter((c) => rows.some((r) => (c.get(r.line) ?? 0) !== 0));
    const total = rows.reduce((s, r) => s + r.pts, 0);
    return { rows, cols, total };
  }, [extras, pid]);

  return (
    <section className="card" aria-labelledby="log-title">
      <header>
        <div className="micro">sleeper’s weekly stats, scored with your league’s settings</div>
        <h2 id="log-title">game log</h2>
      </header>
      {view.rows.length === 0 ? (
        <p className="note">no games on file this season for this player.</p>
      ) : (
        <div className="tw">
          <table>
            <caption className="sr-only">Game log</caption>
            <thead>
              <tr>
                <th scope="col" className="n">wk</th><th scope="col" className="n">fantasy pts</th>
                {view.cols.map((c) => <th key={c.key} scope="col" className="n">{c.label}</th>)}
                <th scope="col" className="n">snaps</th><th scope="col" className="n">snap share</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.week}>
                  <td className="n">{r.week}{r.week === currentWeek && <span className="dim"> *</span>}</td>
                  <td className="n pname">{formatPoints1(r.pts)}</td>
                  {view.cols.map((c) => <td key={c.key} className="n">{c.get(r.line)}</td>)}
                  <td className="n dim">{r.team > 0 ? `${r.snaps}/${r.team}` : '—'}</td>
                  <td className="n">{r.snapPct === null ? '—' : `${Math.round(r.snapPct * 100)}%`}</td>
                </tr>
              ))}
              <tr className="total">
                <td className="micro">total</td><td className="n">{formatPoints1(view.total)}</td>
                <td colSpan={view.cols.length + 2} className="dim">{`${view.rows.length} games · ${formatPoints1(view.total / view.rows.length)} a game`}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="note">snap share is offensive snaps over the team’s offensive snaps (sleeper’s <code>off_snp</code> and <code>tm_off_snp</code>). * the week in progress.</p>
    </section>
  );
}
