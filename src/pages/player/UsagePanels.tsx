import { UsageTrendChart } from '../../components/charts/UsageTrendChart';
import type { TrendSeries } from '../../components/charts/UsageTrendChart';
import { formatCount, formatNum, formatPct, signed } from '../../app/format';
import type { PlayerSeason, PlayerWeek } from '../../data/nflverseTypes';
import { MIN_CARRIES, MIN_ROUTES, MIN_TARGETS } from '../../data/nflverseTypes';
import type { PlayerNflverse } from './nflversePlayer';
import { gated } from './nflverseSelect';
import { SplitTable } from './SplitTable';
import type { SplitRow } from './SplitTable';

const pct = (x: number | null, d = 1) => (x === null ? null : formatPct(x, d));
const num = (x: number | null, d = 1) => (x === null ? null : formatNum(x, d));
const signedNum = (x: number | null) => (x === null ? null : signed(x));

function trend(weeks: PlayerWeek[], pos: string): TrendSeries[] {
  const mk = (id: string, label: string, color: string, unit: string, get: (w: PlayerWeek) => number | null, n: (w: PlayerWeek) => number): TrendSeries => ({
    id, label, color, unit, points: weeks.map((w) => ({ week: w.week, value: get(w), n: n(w) })),
  });
  const out = [
    mk('snap', 'snap %', 'var(--ink)', 'snaps', (w) => w.snap_pct, (w) => w.off_snaps),
    mk('tgt', 'target share', 'var(--green)', 'targets', (w) => w.tgt_share, (w) => w.tgt),
    mk('ay', 'air-yards share', 'var(--gold)', 'targets', (w) => w.ay_share, (w) => w.tgt),
    mk('rz', 'red-zone target share', 'var(--red)', 'rz targets', (w) => w.rz_tgt_share, (w) => w.rz_tgt),
  ];
  if (pos === 'RB' || pos === 'QB') out.push(mk('rush', 'rush share', 'var(--ink-3)', 'carries', (w) => w.rush_share, (w) => w.car));
  return out;
}

export function UsageTrends({ weeks, pos }: { weeks: PlayerWeek[]; pos: string }) {
  return (
    <section className="card" aria-labelledby="trend-title">
      <header>
        <div className="micro">by week, from play-by-play and snap counts</div>
        <h2 id="trend-title">usage trends</h2>
      </header>
      <UsageTrendChart series={trend(weeks, pos)} label="Usage by week: snap percent, target share, air-yards share and red-zone target share" />
      <p className="note">target share is his targets over the team’s pass attempts; air-yards share is his air yards over the team’s. weeks he did not play have no point.</p>
    </section>
  );
}

export function SeasonUsage({ s, defs }: { s: PlayerSeason; defs: Record<string, string> }) {
  const rows: SplitRow[] = [
    { key: 'snap', label: 'snap share', value: pct(s.snap_pct), sample: s.tm_snaps, unit: 'team snaps', hint: defs.snap_pct },
    { key: 'tgt_share', label: 'target share', value: pct(gated(s.tgt_share, s.tgt, 'targets')), sample: s.tgt, unit: 'targets', gate: 'targets', hint: defs.tgt_share },
    { key: 'ay_share', label: 'air-yards share', value: pct(gated(s.ay_share, s.tgt, 'targets')), sample: s.tgt, unit: 'targets', gate: 'targets', hint: defs.ay_share },
    { key: 'adot', label: 'average depth of target', value: num(gated(s.adot, s.tgt, 'targets')), sample: s.tgt, unit: 'targets', gate: 'targets', hint: defs.adot },
    { key: 'wopr', label: 'wopr', value: num(gated(s.wopr, s.tgt, 'targets'), 2), sample: s.tgt, unit: 'targets', gate: 'targets', hint: defs.wopr },
    { key: 'ypt', label: 'yards per target', value: num(gated(s.ypt, s.tgt, 'targets')), sample: s.tgt, unit: 'targets', gate: 'targets', hint: defs.ypt },
    { key: 'catch', label: 'catch rate vs catchable targets', value: pct(gated(s.catch_rate, s.catchable_tgt, 'targets')), sample: s.catchable_tgt, unit: 'catchable targets', gate: 'targets', hint: defs.catch_rate, missing: 'needs charted targets' },
    { key: 'rz', label: 'red-zone target share', value: pct(gated(s.rz_tgt_share, s.tgt, 'targets')), sample: s.rz_tgt, unit: 'rz targets', gate: 'targets', hint: defs.rz_tgt_share },
    { key: 'i10', label: 'inside-10 target share', value: pct(gated(s.i10_tgt_share, s.tgt, 'targets')), sample: s.i10_tgt, unit: 'inside-10 targets', gate: 'targets', hint: defs.i10_tgt_share },
    { key: 'ez', label: 'end-zone targets', value: s.tgt >= MIN_TARGETS ? String(s.ez_tgt) : null, sample: s.tgt, unit: 'targets', gate: 'targets', hint: defs.ez_tgt },
    {
      key: 'tpo', label: 'targets per offensive snap', tag: 'proxy for targets per route', value: pct(gated(s.tgt_per_snap, s.off_snaps, 'routes'), 1),
      sample: s.off_snaps, unit: 'snaps', gate: 'routes', hint: defs.tgt_per_snap,
    },
    { key: 'xtd', label: 'touchdowns above expected', value: signedNum(s.td_gap), sample: s.tgt + s.car, unit: 'opportunities', hint: defs.td_gap, missing: 'the expected-td model is not available' },
  ];
  const rb = s.car >= MIN_CARRIES;
  if (rb) {
    rows.splice(1, 0, { key: 'rush', label: 'rush share', value: pct(gated(s.rush_share, s.car, 'carries')), sample: s.car, unit: 'carries', gate: 'carries', hint: defs.rush_share });
  }
  return (
    <section className="card" aria-labelledby="season-usage-title">
      <header>
        <div className="micro">{`season to date, ${s.games} ${s.games === 1 ? 'game' : 'games'}`}</div>
        <h2 id="season-usage-title">season usage</h2>
      </header>
      <SplitTable caption="Season usage" rows={rows} />
      <p className="note">splits under {MIN_TARGETS} targets, {MIN_CARRIES} carries or {MIN_ROUTES} snaps or routes are hidden; the sample size is always shown.</p>
    </section>
  );
}

export function RbSplits({ s }: { s: PlayerSeason }) {
  if (s.car < 1) return null;
  const rows: SplitRow[] = [
    { key: 'ypc', label: 'yards per carry', value: num(gated(s.ypc, s.car, 'carries'), 2), sample: s.car, unit: 'carries', gate: 'carries' },
    { key: 'stk', label: 'yards per carry into stacked boxes (8 or more)', value: num(gated(s.ypc_stk, s.stk_car, 'carries'), 2), sample: s.stk_car, unit: 'carries', gate: 'carries' },
    { key: 'lgt', label: 'yards per carry into light boxes (6 or fewer)', value: num(gated(s.ypc_lgt, s.lgt_car, 'carries'), 2), sample: s.lgt_car, unit: 'carries', gate: 'carries' },
    { key: 'stkshare', label: 'carries into stacked boxes', value: pct(gated(s.box_car > 0 ? s.stk_car / s.box_car : null, s.box_car, 'carries')), sample: s.box_car, unit: 'charted carries', gate: 'carries' },
    { key: 'rzcar', label: 'red-zone carry share', value: pct(gated(s.rz_car_share, s.car, 'carries')), sample: s.rz_car, unit: 'rz carries', gate: 'carries' },
    { key: 'i10car', label: 'inside-10 carry share', value: pct(gated(s.i10_car_share, s.car, 'carries')), sample: s.i10_car, unit: 'inside-10 carries', gate: 'carries' },
  ];
  return (
    <section className="card" aria-labelledby="rb-title">
      <header>
        <div className="micro">box counts from ftn charting</div>
        <h2 id="rb-title">rushing splits</h2>
      </header>
      <SplitTable caption="Rushing box splits" rows={rows} />
    </section>
  );
}

export function FtnSplits({ s }: { s: PlayerSeason }) {
  if (s.tgt < 1) return null;
  const rows: SplitRow[] = [
    { key: 'bl', label: 'yards per target vs a blitz', value: num(gated(s.ypt_bl, s.bl_tgt, 'targets')), sample: s.bl_tgt, unit: 'targets', gate: 'targets' },
    { key: 'nbl', label: 'yards per target with no blitz', value: num(gated(s.ypt_nbl, s.nbl_tgt, 'targets')), sample: s.nbl_tgt, unit: 'targets', gate: 'targets' },
    { key: 'pa', label: 'play-action share of targets', value: pct(gated(s.pa_share, s.ftn_tgt, 'targets')), sample: s.ftn_tgt, unit: 'charted targets', gate: 'targets' },
    { key: 'scr', label: 'screen share of targets', value: pct(gated(s.scr_share, s.ftn_tgt, 'targets')), sample: s.ftn_tgt, unit: 'charted targets', gate: 'targets' },
    { key: 'cont', label: 'contested-catch rate', value: pct(gated(s.cont_rate, s.cont_tgt, 'targets')), sample: s.cont_tgt, unit: 'contested targets', gate: 'targets' },
    { key: 'drop', label: 'drop rate', value: pct(gated(s.drop_rate, s.catchable_tgt, 'targets')), sample: s.catchable_tgt, unit: 'catchable targets', gate: 'targets' },
  ];
  return (
    <section className="card" aria-labelledby="ftn-title">
      <header>
        <div className="micro">charting data from ftn</div>
        <h2 id="ftn-title">charting splits</h2>
      </header>
      <SplitTable caption="Charting splits" rows={rows} />
    </section>
  );
}

export function CoveragePanel({ cov }: { cov: NonNullable<PlayerNflverse['coverage']> }) {
  const row = cov.row;
  const label = cov.isCurrent ? `${cov.season} season` : `last season (${cov.season})`;
  const ratio = (v: number | null) => (v === null ? null : formatNum(v, 2));
  const rows: SplitRow[] = row ? [
    { key: 'yprr', label: 'yards per route run', tag: 'route proxy', value: ratio(gated(row.yprr, row.routes, 'routes')), sample: row.routes, unit: 'routes', gate: 'routes' },
    { key: 'tprr', label: 'targets per route run', tag: 'route proxy', value: ratio(gated(row.tprr, row.routes, 'routes')), sample: row.routes, unit: 'routes', gate: 'routes' },
    { key: 'yprr_man', label: 'yards per route vs man', tag: 'route proxy', value: ratio(gated(row.yprr_man, row.man_routes, 'routes')), sample: row.man_routes, unit: 'routes', gate: 'routes' },
    { key: 'yprr_zone', label: 'yards per route vs zone', tag: 'route proxy', value: ratio(gated(row.yprr_zone, row.zone_routes, 'routes')), sample: row.zone_routes, unit: 'routes', gate: 'routes' },
    { key: 'tprr_man', label: 'targets per route vs man', tag: 'route proxy', value: ratio(gated(row.tprr_man, row.man_routes, 'routes')), sample: row.man_routes, unit: 'routes', gate: 'routes' },
    { key: 'tprr_zone', label: 'targets per route vs zone', tag: 'route proxy', value: ratio(gated(row.tprr_zone, row.zone_routes, 'routes')), sample: row.zone_routes, unit: 'routes', gate: 'routes' },
  ] : [];
  const shells = Object.entries(cov.shells ?? {}).filter(([, t]) => t[0] >= MIN_ROUTES).sort((a, b) => b[1][0] - a[1][0]);
  return (
    <section className="card" aria-labelledby="cov-title">
      <header>
        <div className="micro">{label}</div>
        <h2 id="cov-title">coverage and routes</h2>
        {!cov.isCurrent && <p className="note">participation data for the current season is not published yet, so these splits are from {label}.</p>}
      </header>
      {!row ? <p className="note">no route data for this player in {label}.</p> : <SplitTable caption={`Coverage splits, ${label}`} rows={rows} />}
      {shells.length > 0 && (
        <div className="tw">
          <table>
            <caption className="sr-only">By coverage shell</caption>
            <thead><tr><th scope="col">coverage shell</th><th scope="col" className="n">routes</th><th scope="col" className="n">targets</th><th scope="col" className="n">yards</th><th scope="col" className="n">yards per route</th></tr></thead>
            <tbody>
              {shells.map(([name, t]) => (
                <tr key={name}>
                  <td>{name.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="n">{formatCount(t[0])}</td><td className="n">{t[1]}</td><td className="n">{t[3]}</td><td className="n">{formatNum(t[3] / t[0], 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note">{cov.routesDefinition}</p>
    </section>
  );
}
