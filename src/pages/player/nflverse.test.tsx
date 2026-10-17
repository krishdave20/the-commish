import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { nvCoverage, nvManifest, nvSeason, nvWeek } from '../../test/fakes';
import type { PlayerNflverse } from './nflversePlayer';
import { NflversePanels } from './NflversePanels';
import { gated } from './nflverseSelect';

afterEach(cleanup);

const weeks = [1, 2, 3].map((w) => nvWeek({
  pid: 'p', week: w, off_snaps: 50 + w, tm_snaps: 60, snap_pct: (50 + w) / 60, tgt: 6 + w, tgt_share: 0.2 + w / 100, ay_share: 0.25, rz_tgt: w, rz_tgt_share: 0.1 * w,
}));

const season = nvSeason({
  pid: 'p', games: 3, off_snaps: 160, tm_snaps: 180, snap_pct: 0.889, tgt: 40, rec: 28, rec_yds: 400, catchable_tgt: 36, ftn_tgt: 38,
  tgt_share: 0.253, ay_share: 0.3, adot: 9.6, wopr: 0.71, ypt: 10, catch_rate: 0.778, rz_tgt: 6, i10_tgt: 2, rz_tgt_share: 0.2, i10_tgt_share: 0.25, ez_tgt: 3,
  tgt_per_snap: 0.25, td_gap: 1.3, bl_tgt: 9, ypt_bl: 12.1, nbl_tgt: 29, ypt_nbl: 9.4, pa_share: 0.21, scr_share: 0.1, cont_tgt: 5, cont_rate: 0.6,
  drops: 2, drop_rate: 0.056,
});

const data: PlayerNflverse = {
  manifest: nvManifest(),
  weeks,
  season,
  coverage: {
    row: nvCoverage({ pid: 'p', routes: 520, tgt: 90, rec: 60, yds: 780, yprr: 1.5, tprr: 0.17, man_routes: 120, man_yds: 150, yprr_man: 1.25, zone_routes: 15, zone_yds: 30, yprr_zone: 2 }),
    shells: { COVER_3: [200, 30, 20, 300, 2], COVER_2: [10, 2, 1, 12, 0] },
    season: 2025, isCurrent: false, routesDefinition: 'Routes are a proxy: dropbacks a player was on the field for as a WR, TE or RB.',
  },
};

describe('gated', () => {
  it('hides a value whose sample is under the minimum', () => {
    expect(gated(0.3, 15, 'targets')).toBe(0.3);
    expect(gated(0.3, 14, 'targets')).toBeNull();
    expect(gated(4.5, 15, 'carries')).toBe(4.5);
    expect(gated(4.5, 14, 'carries')).toBeNull();
    expect(gated(1.2, 20, 'routes')).toBe(1.2);
    expect(gated(1.2, 19, 'routes')).toBeNull();
    expect(gated(null, 100, 'targets')).toBeNull();
  });
});

describe('nflverse panels', () => {
  it('says nflverse data arrives with the nightly update when there is none', () => {
    render(<NflversePanels pos="WR" data={null} loading={false} />);
    expect(screen.getByText('nflverse data arrives with the nightly update.')).toBeInTheDocument();
  });

  it('shows a loading note, and a note when the player has no usage', () => {
    const { rerender } = render(<NflversePanels pos="WR" data={null} loading />);
    expect(screen.getByText(/loading the nightly nflverse data/)).toBeInTheDocument();
    rerender(<NflversePanels pos="WR" data={{ manifest: nvManifest(), weeks: [], season: null, coverage: null }} loading={false} />);
    expect(screen.getByText('no nflverse usage on file for this player yet.')).toBeInTheDocument();
  });

  it('draws usage trends by week', () => {
    const { container } = render(<NflversePanels pos="WR" data={data} loading={false} />);
    expect(screen.getByRole('heading', { level: 2, name: 'usage trends' })).toBeInTheDocument();
    expect(container.querySelectorAll('path.trend-line')).toHaveLength(4); // no rush share for a receiver
    expect(screen.getByRole('img', { name: /Usage by week/ })).toBeInTheDocument();
    expect(container.querySelector('[data-series="tgt"] .trend-dot title')!.textContent).toBe('target share, week 1: 21.0% (7 targets)');
  });

  it('adds rush share to the trends for a running back', () => {
    const { container } = render(<NflversePanels pos="RB" data={data} loading={false} />);
    expect(container.querySelectorAll('path.trend-line')).toHaveLength(5);
  });

  it('shows the season usage table with a sample size on every row', () => {
    render(<NflversePanels pos="WR" data={data} loading={false} />);
    const table = screen.getByRole('table', { name: 'Season usage' });
    const row = (label: string) => within(table).getByText(label).closest('tr')!;
    expect(row('target share')).toHaveTextContent('25.3%');
    expect(row('target share')).toHaveTextContent('40 targets');
    expect(row('average depth of target')).toHaveTextContent('9.6');
    expect(row('wopr')).toHaveTextContent('0.71');
    expect(row('yards per target')).toHaveTextContent('10.0');
    expect(row('catch rate vs catchable targets')).toHaveTextContent('77.8%');
    expect(row('catch rate vs catchable targets')).toHaveTextContent('36 catchable targets');
    expect(row('red-zone target share')).toHaveTextContent('20.0%');
    expect(row('end-zone targets')).toHaveTextContent('3');
    expect(row('touchdowns above expected')).toHaveTextContent('+1.3');
    expect(within(table).getByText('target share')).toHaveAttribute('title', 'His targets over the team’s pass attempts.');
  });

  it('labels the per-snap number as a proxy', () => {
    render(<NflversePanels pos="WR" data={data} loading={false} />);
    const row = within(screen.getByRole('table', { name: 'Season usage' })).getByText('targets per offensive snap').closest('tr')!;
    expect(row).toHaveTextContent('proxy for targets per route');
    expect(row).toHaveTextContent('25.0%');
  });

  it('hides splits under the minimum and says why, while still showing the sample', () => {
    render(<NflversePanels pos="WR" data={data} loading={false} />);
    const ftn = screen.getByRole('table', { name: 'Charting splits' });
    const bl = within(ftn).getByText('yards per target vs a blitz').closest('tr')!;
    expect(bl).toHaveTextContent('—');
    expect(bl).toHaveTextContent('9 targets');
    expect(bl).toHaveTextContent('hidden: under 15 targets');
    const nbl = within(ftn).getByText('yards per target with no blitz').closest('tr')!;
    expect(nbl).toHaveTextContent('9.4');
    expect(nbl).toHaveTextContent('29 targets');
    expect(within(ftn).getByText('play-action share of targets').closest('tr')).toHaveTextContent('21.0%');
    expect(within(ftn).getByText('contested-catch rate').closest('tr')).toHaveTextContent('hidden: under 15 contested targets');
  });

  it('shows rushing box splits for a running back only, gated on carries', () => {
    const rb = nvSeason({ pid: 'p', car: 60, box_car: 50, stk_car: 10, stk_yds: 30, lgt_car: 20, lgt_yds: 110, ypc: 4.6, ypc_stk: 3, ypc_lgt: 5.5, tgt: 3, rz_car: 8, rz_car_share: 0.4, rush_share: 0.55 });
    const { rerender } = render(<NflversePanels pos="RB" data={{ ...data, season: rb }} loading={false} />);
    const t = screen.getByRole('table', { name: 'Rushing box splits' });
    expect(within(t).getByText(/stacked boxes \(8 or more\)$/).closest('tr')).toHaveTextContent('hidden: under 15 carries');
    expect(within(t).getByText(/stacked boxes \(8 or more\)$/).closest('tr')).toHaveTextContent('10 carries');
    expect(within(t).getByText(/light boxes/).closest('tr')).toHaveTextContent('5.50');
    expect(within(t).getByText('yards per carry').closest('tr')).toHaveTextContent('4.60');
    rerender(<NflversePanels pos="WR" data={{ ...data, season: rb }} loading={false} />);
    expect(screen.queryByRole('table', { name: 'Rushing box splits' })).not.toBeInTheDocument();
  });

  it('labels coverage splits "last season" while participation is not current, with the route definition', () => {
    render(<NflversePanels pos="WR" data={data} loading={false} />);
    expect(screen.getByText('last season (2025)')).toBeInTheDocument();
    expect(screen.getByText(/participation data for the current season is not published yet/)).toBeInTheDocument();
    const t = screen.getByRole('table', { name: 'Coverage splits, last season (2025)' });
    expect(within(t).getByText('yards per route run').closest('tr')).toHaveTextContent('1.50');
    expect(within(t).getByText('yards per route run').closest('tr')).toHaveTextContent('520 routes');
    expect(within(t).getByText('yards per route run').closest('tr')).toHaveTextContent('route proxy');
    expect(within(t).getByText('yards per route vs man').closest('tr')).toHaveTextContent('1.25');
    expect(within(t).getByText('yards per route vs zone').closest('tr')).toHaveTextContent('hidden: under 20 routes'); // 15 routes
    expect(screen.getByText(/Routes are a proxy/)).toBeInTheDocument();
    const shells = screen.getByRole('table', { name: 'By coverage shell' });
    expect(within(shells).getByText('cover 3')).toBeInTheDocument();
    expect(within(shells).queryByText('cover 2')).not.toBeInTheDocument(); // 10 routes: under the minimum
  });

  it('calls a current-season coverage panel by its season', () => {
    const cur = { ...data, coverage: { ...data.coverage!, season: 2026, isCurrent: true } };
    render(<NflversePanels pos="WR" data={cur} loading={false} />);
    expect(screen.getByText('2026 season')).toBeInTheDocument();
    expect(screen.queryByText(/not published yet/)).not.toBeInTheDocument();
  });
});
