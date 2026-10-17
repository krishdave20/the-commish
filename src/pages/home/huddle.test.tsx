import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ageOf } from '../../app/playersIndex';
import { formatCountdown } from '../../app/useNow';
import { parsePreviewPhase, previewName } from '../../app/huddlePhase';
import { loadLeagueHistory, summarizeSeason } from '../../app/leagueHistory';
import type { LoadModel } from '../../app/loadModel';
import { renderApp } from '../../app/testUtils';
import type { LeagueBundle, NflState, SleeperDraft, SleeperLeague } from '../../data';
import { buildRankings, createMock, draftOrderFor, slotOfUser } from '../../engine';
import {
  FAKE_AS_OF, createFakeApi, createFakeSleeper, sampleAccount, sampleBundle, sampleLeague, sampleLoadModel, sampleModel,
  samplePriorLeague, sampleSeasonProjections, stubBuildTakes,
} from '../../test/fakes';
import type { FakeSeason } from '../../test/fakes';
import { Countdown } from './PreDraft';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

const linked = [sampleAccount()];

function apiWith(bundle: LeagueBundle, nflState?: NflState) {
  const api = createFakeApi({ nflState });
  api.leagueBundle.mockResolvedValue({ data: bundle, asOf: FAKE_AS_OF, fromCache: false, stale: false });
  return api;
}

function bundleWith(patch: (b: LeagueBundle) => void): LeagueBundle {
  const b = sampleBundle(structuredClone(sampleLeague)); // never mutate the shared sample league
  patch(b);
  return b;
}

/** rosters with players on them, for the pages that read who owns whom */
function rostered(b: LeagueBundle) {
  b.rosters[0]!.players = ['t1qb', 't1rb', 't1wr', 't1bw'];
  b.rosters[1]!.players = ['t2qb', 't2wr'];
}

const section = (name: string, level = 2) => screen.getByRole('heading', { level, name }).closest('section')!;

describe('pure helpers', () => {
  it('parses the preview phase', () => {
    expect(parsePreviewPhase('offseason')).toBe('offseason');
    expect(parsePreviewPhase('Pre-Draft')).toBe('pre_draft');
    expect(parsePreviewPhase('in_season')).toBe('in_season');
    expect(parsePreviewPhase('bogus')).toBeNull();
    expect(parsePreviewPhase(null)).toBeNull();
    expect(previewName('pre_draft')).toBe('pre-draft');
    expect(previewName('drafting')).toBe('draft day');
  });

  it('formats a countdown', () => {
    expect(formatCountdown(3 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000 + 59_000)).toBe('3d 4h 12m');
    expect(formatCountdown(4 * 3_600_000 + 5 * 60_000)).toBe('4h 5m');
    expect(formatCountdown(12 * 60_000)).toBe('12m');
    expect(formatCountdown(30_000)).toBe('under a minute');
    expect(formatCountdown(-5)).toBe('under a minute');
  });

  it('names the champion when Sleeper records one, else the standings leader', () => {
    const b = sampleBundle();
    const champ = summarizeSeason({ ...samplePriorLeague, metadata: { latest_league_winner_roster_id: '4' } }, b.rosters, b.users, 'u1');
    expect(champ.decided).toBe('champion');
    expect(champ.winner).toMatchObject({ rid: 4, team: 'Fourth and Long', isMe: false });
    const leader = summarizeSeason(samplePriorLeague, b.rosters, b.users, 'u1');
    expect(leader.decided).toBe('standings');
    expect(leader.winner).toMatchObject({ rid: 2, team: 'Reed Between the Lines', wins: 5, losses: 1 });
    expect(leader.winner!.pf).toBeCloseTo(640.05);
    // a manager without a team name falls back to his display name; a roster without an owner to its id
    const noName = summarizeSeason({ ...samplePriorLeague, metadata: { latest_league_winner_roster_id: '3' } }, b.rosters, b.users, null);
    expect(noName.winner!.team).toBe('Team Jordan Hale');
    expect(summarizeSeason(samplePriorLeague, [], [], null).winner).toBeNull();
  });

  it('walks previous_league_id, stops at the depth limit and never loops', async () => {
    const b = sampleBundle();
    const mk = (id: string, season: string, prev: string | null): FakeSeason => ({
      league: { ...samplePriorLeague, league_id: id, season, previous_league_id: prev }, rosters: b.rosters, users: b.users,
    });
    const sleeper = createFakeSleeper({ seasons: { A: mk('A', '2025', 'B'), B: mk('B', '2024', 'C'), C: mk('C', '2023', 'A'), Z: mk('Z', '2020', '0') } });
    const all = await loadLeagueHistory(sleeper, { ...sampleLeague, previous_league_id: 'A' }, 'u1');
    expect(all.data.map((s) => s.season)).toEqual(['2025', '2024', '2023']); // C points back at A: stop
    const capped = await loadLeagueHistory(sleeper, { ...sampleLeague, previous_league_id: 'A' }, 'u1', { max: 2 });
    expect(capped.data).toHaveLength(2);
    const none = await loadLeagueHistory(sleeper, { ...sampleLeague, previous_league_id: '0' }, 'u1');
    expect(none.data).toEqual([]);
    // a missing season ends the chain but keeps what was found; a missing first season is an error
    const broken = await loadLeagueHistory(sleeper, { ...sampleLeague, previous_league_id: 'B' }, 'u1');
    expect(broken.data.map((s) => s.season)).toEqual(['2024', '2023', '2025']); // the chain's own loop is cut where it repeats
    await expect(loadLeagueHistory(sleeper, { ...sampleLeague, previous_league_id: 'nope' }, 'u1')).rejects.toThrow(/No league nope/);
    const partial = createFakeSleeper({ seasons: { A: mk('A', '2025', 'gone') } });
    const r = await loadLeagueHistory(partial, { ...sampleLeague, previous_league_id: 'A' }, 'u1');
    expect(r.data).toHaveLength(1);
    expect(r.error).toMatch(/No league gone/);
  });
});

describe('huddle: in season (live phase)', () => {
  it('shows odds, the matchup, alerts, injuries, top waiver adds and my takes, with the league below', async () => {
    renderApp({ linked, buildTakes: stubBuildTakes() });
    await screen.findByRole('heading', { level: 2, name: 'playoff odds' });
    expect(screen.queryByText(/previewing/)).not.toBeInTheDocument();

    // matchup: my team against Reed Between the Lines, projected totals and a win chance
    const m = section('this week’s matchup');
    expect(m).toHaveTextContent('week 5');
    expect(m).toHaveTextContent('Sunday Scaries');
    expect(m).toHaveTextContent('Reed Between the Lines');
    expect(m).toHaveTextContent('47.0');
    expect(m).toHaveTextContent('46.0');
    expect(m).toHaveTextContent(/you are a \d+% (favorite|underdog) this week\./);
    expect(m).not.toHaveTextContent('live score');

    expect(within(section('playoff odds')).getByText(/magic number|no number of your own wins|eliminated/)).toBeInTheDocument();
    expect(within(section('playoff odds')).getByRole('link', { name: /open the playoff picture/ })).toHaveAttribute('href', '/race');

    // alerts reuse the locker room's logic, minus the waiver adds (they have their own card)
    const alerts = section('start/sit alerts');
    expect(within(alerts).getByText('your lineup is already set right.')).toBeInTheDocument();
    expect(alerts).not.toHaveTextContent('consider adding');

    expect(section('injury flags')).toHaveTextContent('no injury flags on your starters.');

    const wire = section('top waiver adds');
    await waitFor(() => expect(within(wire).getByRole('list', { name: 'Top waiver adds' })).toBeInTheDocument());
    expect(wire).toHaveTextContent('Free Agent Fran');
    expect(wire).toHaveTextContent('drop Backup Wideout');
    expect(wire).toHaveTextContent(/\+\d/);

    // top takes: only my own players'
    const takes = section('hot takes for your players');
    await waitFor(() => expect(within(takes).getAllByRole('article')).toHaveLength(2));
    expect(takes).toHaveTextContent('Walt Wideout’s snap share jumped 18 points');
    expect(takes).not.toHaveTextContent('Free Agent Fran is getting added');
    expect(within(takes).getByRole('link', { name: 'all 5 takes →' })).toHaveAttribute('href', '/takes');

    // the league panel and the standings stay below
    expect(screen.getByRole('heading', { level: 2, name: 'Sample League' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'League standings' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'rookie class' })).not.toBeInTheDocument();
  });

  it('fills the playoff odds from the first simulation', async () => {
    renderApp({ linked, loadModel: sampleLoadModel(() => ({ ...sampleModel(), oddsPending: true })), buildTakes: stubBuildTakes() });
    const odds = await screen.findByRole('heading', { level: 2, name: 'playoff odds' });
    await waitFor(() => expect(within(odds.closest('section')!).getAllByText(/^(>99|<1|\d+)%$/).length).toBeGreaterThan(0), { timeout: 4000 });
  });

  it('shows the live score once the week is under way', async () => {
    const loadModel: LoadModel = async (ctx) => {
      const r = await sampleLoadModel()(ctx);
      r.model.history.push(
        { key: '5-1', week: 5, rid: 1, opp: 2, pts: 31.5, oppPts: 22.2, final: false },
        { key: '5-2', week: 5, rid: 2, opp: 1, pts: 22.2, oppPts: 31.5, final: false },
      );
      return r;
    };
    renderApp({ linked, loadModel, buildTakes: stubBuildTakes() });
    expect(await screen.findByText(/live score: 31\.5 to 22\.2\./)).toBeInTheDocument();
  });

  it('flags injured starters', async () => {
    const loadModel: LoadModel = async (ctx) => {
      const r = await sampleLoadModel()(ctx);
      const wr = r.model.players.find((p) => p.pid === 't1wr')!;
      wr.injury = 'Questionable';
      wr.body = 'Knee';
      r.model.teams[0]!.starters = ['t1qb', 't1rb', 't1wr'];
      return r;
    };
    renderApp({ linked, loadModel, buildTakes: stubBuildTakes() });
    const inj = (await screen.findByRole('heading', { level: 2, name: 'injury flags' })).closest('section')!;
    await waitFor(() => expect(within(inj).getByText('Questionable')).toBeInTheDocument());
    expect(inj).toHaveTextContent('Walt Wideout');
    expect(inj).toHaveTextContent('Knee');
  });

  it('“try” on a waiver add updates the what-if and opens the locker room', async () => {
    const { user } = renderApp({ linked, buildTakes: stubBuildTakes() });
    const wire = (await screen.findByRole('heading', { level: 2, name: 'top waiver adds' })).closest('section')!;
    await user.click(await within(wire).findByRole('button', { name: /Try adding Free Agent Fran/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'locker room' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('wr.scenario.L1')!).adds).toEqual(['fa1']);
  });

  it('says so when none of my players has a take', async () => {
    renderApp({ linked, buildTakes: stubBuildTakes(() => []) });
    expect(await screen.findByText('quiet week. no takes on your players clear the bar.')).toBeInTheDocument();
  });

  it('waits for the model, quietly', async () => {
    renderApp({ linked, loadModel: () => new Promise(() => {}), buildTakes: stubBuildTakes() });
    expect(await screen.findByText(/building the model for your odds, matchup and waiver adds/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'League standings' })).toBeInTheDocument();
  });

  it('postseason (override) uses the same sections', async () => {
    renderApp({ linked, route: '/?phase=postseason', buildTakes: stubBuildTakes() });
    expect(await screen.findByRole('heading', { level: 2, name: 'this week’s matchup' })).toBeInTheDocument();
    expect(screen.getByText('previewing: postseason')).toBeInTheDocument();
  });
});

describe('huddle: preview override', () => {
  it('shows the preview note, and “back to live” returns to the real phase', async () => {
    const { user } = renderApp({ linked, route: '/?phase=offseason', sleeper: createFakeSleeper(), buildTakes: stubBuildTakes() });
    expect(await screen.findByText('previewing: offseason')).toBeInTheDocument();
    const back = screen.getByRole('link', { name: 'back to live' });
    expect(back).toHaveAttribute('href', '/');
    expect(await screen.findByRole('heading', { level: 2, name: 'value movers' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'playoff odds' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'League standings' })).not.toBeInTheDocument();

    await user.click(back);
    expect(await screen.findByRole('heading', { level: 2, name: 'playoff odds' })).toBeInTheDocument();
    expect(screen.queryByText(/previewing/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'value movers' })).not.toBeInTheDocument();
  });

  it('ignores a phase it does not know', async () => {
    renderApp({ linked, route: '/?phase=bogus', buildTakes: stubBuildTakes() });
    expect(await screen.findByRole('heading', { level: 2, name: 'playoff odds' })).toBeInTheDocument();
    expect(screen.queryByText(/previewing/)).not.toBeInTheDocument();
  });
});

describe('huddle: offseason', () => {
  const seasons = (): Record<string, FakeSeason> => {
    const b = sampleBundle();
    const lz = sampleBundle().rosters.map((r) => ({ ...r, settings: { ...r.settings, wins: r.roster_id === 1 ? 10 : 3 } }));
    return {
      L0: { league: { ...samplePriorLeague, previous_league_id: 'LZ', metadata: { latest_league_winner_roster_id: '2' } }, rosters: b.rosters, users: b.users },
      LZ: { league: { ...samplePriorLeague, league_id: 'LZ', season: '2024', previous_league_id: null }, rosters: lz, users: b.users },
    };
  };
  const league = (patch: Partial<SleeperLeague> = {}) => bundleWith((b) => { Object.assign(b.league, { previous_league_id: 'L0', ...patch }); rostered(b); });
  const route = '/?phase=offseason';

  it('shows value movers among rostered players, with a note when the league is not dynasty', async () => {
    const sleeper = createFakeSleeper({
      seasons: seasons(),
      fantasyCalcRows: [
        { player: { id: 1, name: 'Alex Arm', sleeperId: 't1qb', position: 'QB' }, value: 7000, overallRank: 12, positionRank: 3, trend30Day: 320 },
        { player: { id: 2, name: 'Walt Wideout', sleeperId: 't1wr', position: 'WR' }, value: 5234, overallRank: 44, positionRank: 18, trend30Day: -150 },
        { player: { id: 3, name: 'Reed Receiver', sleeperId: 't2wr', position: 'WR' }, value: 4000, overallRank: 60, positionRank: 22, trend30Day: -400 },
        { player: { id: 4, name: 'Free Agent Fran', sleeperId: 'fa1', position: 'WR' }, value: 900, overallRank: 300, positionRank: 90, trend30Day: 900 },
        { player: { id: 5, name: '2027 Early 1st', sleeperId: 'FP_2027_early_1', position: 'PICK' }, value: 5000, overallRank: 40, positionRank: 1, trend30Day: 700 },
      ] as never,
    });
    renderApp({ linked, api: apiWith(league()), sleeper, route, buildTakes: stubBuildTakes() });
    const movers = (await screen.findByRole('heading', { level: 2, name: 'value movers' })).closest('section')!;
    const up = await within(movers).findByRole('table', { name: 'biggest risers' });
    const down = within(movers).getByRole('table', { name: 'biggest fallers' });
    expect(within(up).getAllByRole('row').slice(1).map((r) => r.textContent)).toEqual(['Alex Arm' + 'you' + 'QB' + '7,000' + '+320']);
    expect(within(down).getAllByRole('row').slice(1).map((r) => r.textContent)).toEqual([
      'Reed Receiver' + 'WR' + '4,000' + '−400', 'Walt Wideout' + 'you' + 'WR' + '5,234' + '−150',
    ]);
    expect(movers).toHaveTextContent('this league is not dynasty');
    expect(movers).toHaveTextContent('Values: FantasyCalc.');
  });

  it('keeps the top and bottom five, and drops the note in a dynasty league', async () => {
    const b = league({ settings: { ...sampleLeague.settings, type: 2 } });
    b.rosters[0]!.players = Array.from({ length: 14 }, (_, i) => `m${i}`);
    const rows = Array.from({ length: 14 }, (_, i) => ({
      player: { id: i, name: `Mover ${i}`, sleeperId: `m${i}`, position: 'WR' }, value: 1000 + i, overallRank: i + 1, positionRank: i + 1, trend30Day: (i - 7) * 10 + 5,
    }));
    renderApp({ linked, api: apiWith(b), sleeper: createFakeSleeper({ seasons: seasons(), fantasyCalcRows: rows as never }), route, buildTakes: stubBuildTakes() });
    const movers = (await screen.findByRole('heading', { level: 2, name: 'value movers' })).closest('section')!;
    const up = await within(movers).findByRole('table', { name: 'biggest risers' });
    expect(within(up).getAllByRole('row')).toHaveLength(6);
    expect(within(up).getAllByRole('row')[1]).toHaveTextContent('Mover 13'); // +75, the biggest
    expect(within(within(movers).getByRole('table', { name: 'biggest fallers' })).getAllByRole('row')).toHaveLength(6);
    expect(movers).not.toHaveTextContent('not dynasty');
  });

  it('says so when FantasyCalc is down', async () => {
    renderApp({ linked, api: apiWith(league()), sleeper: createFakeSleeper({ seasons: seasons(), fantasyCalcFails: true }), route, buildTakes: stubBuildTakes() });
    expect(await screen.findByText(/values are unavailable right now\. FantasyCalc is unavailable: FantasyCalc is down/)).toBeInTheDocument();
  });

  it('lists the rookie class from the draft engine’s rookie rankings, top 12 at most', async () => {
    const sleeper = createFakeSleeper({ seasons: seasons() });
    renderApp({ linked, api: apiWith(league()), sleeper, route, buildTakes: stubBuildTakes() });
    const table = await screen.findByRole('table', { name: 'Rookie class, top 12' });
    const names = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1]!.textContent);
    expect(names.sort()).toEqual(['QB5 X', 'RB4 X', 'RB9 X', 'WR3 X', 'WR8 X']);
    // projections are asked for the NFL season, not the followed league's
    expect(sleeper.seasonProjections).toHaveBeenCalledWith('2026', expect.anything(), expect.anything());
    cleanup();

    const many = sampleSeasonProjections();
    for (const r of many) if (r.player && (r.player.position === 'K' || r.player.position === 'DEF')) r.player.years_exp = 0; // not a "class"
    many.slice(0, 40).forEach((r) => { if (r.player) r.player.years_exp = 0; });
    renderApp({ linked, api: apiWith(league()), sleeper: createFakeSleeper({ seasons: seasons(), projections: many }), route, buildTakes: stubBuildTakes() });
    const big = await screen.findByRole('table', { name: 'Rookie class, top 12' });
    expect(within(big).getAllByRole('row')).toHaveLength(13);
    expect(within(big).queryByText(/^(K|DEF)\d+ X$/)).not.toBeInTheDocument();
    expect(within(big).queryAllByText(/^(K|DEF)\d+$/)).toHaveLength(0);
  });

  it('says so when the rookie projections are not out, or Sleeper fails', async () => {
    renderApp({ linked, api: apiWith(league()), sleeper: createFakeSleeper({ seasons: seasons(), projections: [] }), route, buildTakes: stubBuildTakes() });
    expect(await screen.findByText('no rookie projections are out yet.')).toBeInTheDocument();
    cleanup();
    renderApp({ linked, api: apiWith(league()), sleeper: createFakeSleeper({ seasons: seasons(), projectionsFail: true }), route, buildTakes: stubBuildTakes() });
    expect(await screen.findByText(/could not load the rookie rankings\. Sleeper projections are down/)).toBeInTheDocument();
  });

  it('draws my roster’s age profile by position from birth dates', async () => {
    renderApp({ linked, api: apiWith(league()), sleeper: createFakeSleeper({ seasons: seasons() }), route, buildTakes: stubBuildTakes() });
    const age = (await screen.findByRole('heading', { level: 2, name: 'roster age profile' })).closest('section')!;
    const list = await within(age).findByRole('list', { name: 'Average age by position' });
    const expected = ageOf({ birth_date: '2000-03-04' })!;
    const items = within(list).getAllByRole('listitem');
    expect(items.map((i) => i.querySelector('.micro')!.textContent)).toEqual(['QB', 'RB', 'WR']);
    expect(items[2]).toHaveTextContent(`${expected.toFixed(1)}2 players`);
    expect(items[0]).toHaveTextContent('1 player');
    expect(age).toHaveTextContent(`your roster averages ${expected.toFixed(1)} years old`);
  });

  it('follows previous_league_id for the league history', async () => {
    const sleeper = createFakeSleeper({ seasons: seasons() });
    renderApp({ linked, api: apiWith(league()), sleeper, route, buildTakes: stubBuildTakes() });
    const hist = (await screen.findByRole('heading', { level: 2, name: 'league history' })).closest('section')!;
    const table = await within(hist).findByRole('table', { name: 'League history' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2025');
    expect(rows[0]).toHaveTextContent('Reed Between the Lines');
    expect(rows[0]).toHaveTextContent('champion');
    expect(rows[1]).toHaveTextContent('2024');
    expect(rows[1]).toHaveTextContent('Sunday Scaries');
    expect(rows[1]).toHaveTextContent('standings leader');
    expect(rows[1]).toHaveClass('me');
    expect(hist).toHaveTextContent('where sleeper does not record a champion');
    expect(sleeper.league.mock.calls.map((c) => c[0])).toEqual(['L0', 'LZ']);
  });

  it('includes the followed league itself when it is a finished season', async () => {
    const b = league({ status: 'complete', season: '2025', previous_league_id: 'L0', metadata: { latest_league_winner_roster_id: '1' } });
    renderApp({
      linked, api: apiWith(b, { week: 1, season: '2026', season_type: 'off', league_season: '2026', previous_season: '2025' }),
      sleeper: createFakeSleeper({ seasons: seasons() }), buildTakes: stubBuildTakes(),
    });
    const hist = (await screen.findByRole('heading', { level: 2, name: 'league history' })).closest('section')!;
    await waitFor(() => expect(within(hist).getAllByRole('row')).toHaveLength(4));
    const rows = within(hist).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Sunday Scaries');
    expect(rows[0]).toHaveTextContent('champion');
  });

  it('says so when a league has no earlier seasons, and keeps what it found when one cannot load', async () => {
    renderApp({ linked, api: apiWith(league({ previous_league_id: null })), sleeper: createFakeSleeper(), route, buildTakes: stubBuildTakes() });
    expect(await screen.findByText('this league has no earlier seasons on sleeper.')).toBeInTheDocument();
    cleanup();
    const s = seasons();
    delete s.LZ;
    renderApp({ linked, api: apiWith(league()), sleeper: createFakeSleeper({ seasons: s }), route, buildTakes: stubBuildTakes() });
    const table = await screen.findByRole('table', { name: 'League history' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(await screen.findByText(/some earlier seasons could not be loaded/)).toBeInTheDocument();
  });

  it('is the live layout when the league is last season’s', async () => {
    const b = league({ status: 'complete', season: '2025' });
    renderApp({
      linked, api: apiWith(b, { week: 1, season: '2026', season_type: 'off', league_season: '2026', previous_season: '2025' }),
      sleeper: createFakeSleeper({ seasons: seasons() }), buildTakes: stubBuildTakes(),
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'value movers' })).toBeInTheDocument();
    expect(screen.queryByText(/previewing/)).not.toBeInTheDocument();
  });
});

describe('huddle: pre-draft', () => {
  const day = 86_400_000;
  const draftOf = (patch: Partial<SleeperDraft> = {}): SleeperDraft => ({
    draft_id: 'L1-draft', league_id: 'L1', season: '2026', status: 'pre_draft', type: 'snake',
    start_time: Date.now() + 3 * day + 4 * 3_600_000 + 12 * 60_000 + 30_000, settings: { teams: 6, rounds: 6 }, draft_order: { u1: 3 }, ...patch,
  });
  const preDraft = (patch: Partial<SleeperDraft> = {}) => bundleWith((b) => {
    b.league.status = 'pre_draft';
    b.drafts = [draftOf(patch)];
  });
  const sleeperFor = (draft: SleeperDraft, o = {}) => createFakeSleeper({ draft, ...o });

  it('is the live layout when the league has not drafted', async () => {
    const b = preDraft();
    renderApp({ linked, api: apiWith(b), sleeper: sleeperFor(b.drafts[0]!), buildTakes: stubBuildTakes() });
    expect(await screen.findByRole('heading', { level: 2, name: 'draft countdown' })).toBeInTheDocument();
    expect(screen.queryByText(/previewing/)).not.toBeInTheDocument();
  });

  it('counts down to the draft, shows my slot, the tiers to study and the mock grade at my real slot', async () => {
    const b = preDraft();
    renderApp({ linked, api: apiWith(b), sleeper: sleeperFor(b.drafts[0]!), buildTakes: stubBuildTakes() });
    const cd = (await screen.findByRole('heading', { level: 2, name: 'draft countdown' })).closest('section')!;
    expect(within(cd).getByRole('timer')).toHaveTextContent('3d 4h 12m');
    expect(section('your draft slot')).toHaveTextContent('3 of 6');
    expect(section('your draft slot')).toHaveTextContent('you pick #3 overall in round one.');

    // the quick mock matches the engine run at slot 3
    const draft = b.drafts[0]!;
    const rankings = buildRankings({ projections: sampleSeasonProjections(), league: b.league, mode: 'redraft', players: null, fantasyCalc: null });
    const order = draftOrderFor(draft, [], 6);
    const mock = createMock({ rankings, order, userRosterId: order.find((o) => o.slot === slotOfUser(draft, 'u1'))!.originalRosterId });
    mock.autoAll();
    const grade = mock.state.grade!;
    const box = (await screen.findByRole('heading', { level: 2, name: 'mock draft' })).closest('section')!;
    await waitFor(() => expect(box).toHaveTextContent('projected grade'));
    expect(box).toHaveTextContent(`projected grade${grade.letter}`);
    expect(box).toHaveTextContent(`lineup rank${grade.rank} of ${grade.teams}`);
    expect(within(box).getByRole('link', { name: 'run the full mock draft →' })).toHaveAttribute('href', '/draft?tab=mock');
    expect(within(box).getByRole('link', { name: 'see the rankings →' })).toHaveAttribute('href', '/draft?tab=rankings');
    expect(box).toHaveTextContent('your first picks:');

    const tiers = section('tiers to study');
    expect(tiers).toHaveTextContent('RB tier 1');
    expect(tiers).toHaveTextContent('QB tier 1');
  });

  it('keeps the prep checklist in localStorage per league, with line-through styling hooks', async () => {
    const b = preDraft();
    const first = renderApp({ linked, api: apiWith(b), sleeper: sleeperFor(b.drafts[0]!), buildTakes: stubBuildTakes() });
    const prep = (await screen.findByRole('heading', { level: 2, name: 'prep checklist' })).closest('section')!;
    await waitFor(() => expect(within(prep).getByRole('checkbox', { name: /study the tiers: \w+ tier 1–2/ })).toBeInTheDocument());
    expect(within(prep).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(prep).getAllByRole('checkbox').every((c) => !(c as HTMLInputElement).checked)).toBe(true);

    await first.user.click(within(prep).getByRole('checkbox', { name: 'run a mock draft' }));
    expect(within(prep).getByRole('checkbox', { name: 'run a mock draft' })).toBeChecked();
    expect(JSON.parse(window.localStorage.getItem('wr.prep.L1')!)).toEqual(['mock']);
    first.unmount();

    renderApp({ linked, api: apiWith(b), sleeper: sleeperFor(b.drafts[0]!), buildTakes: stubBuildTakes() });
    const again = (await screen.findByRole('heading', { level: 2, name: 'prep checklist' })).closest('section')!;
    expect(within(again).getByRole('checkbox', { name: 'run a mock draft' })).toBeChecked();
    expect(within(again).getByRole('checkbox', { name: 'set your queue' })).not.toBeChecked();
    await userUntick(again);
    expect(JSON.parse(window.localStorage.getItem('wr.prep.L1')!)).toEqual([]);
  });

  async function userUntick(scope: HTMLElement) {
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.setup().click(within(scope).getByRole('checkbox', { name: 'run a mock draft' }));
  }

  it('says so when the slot or the start time is not set', async () => {
    const b = preDraft({ draft_order: null, start_time: null });
    renderApp({ linked, api: apiWith(b), sleeper: sleeperFor(b.drafts[0]!), buildTakes: stubBuildTakes() });
    expect(await screen.findByText(/no draft time is set yet/)).toBeInTheDocument();
    expect(screen.getByText(/the draft order is not set yet/)).toBeInTheDocument();
    expect(await screen.findByText(/your slot is not set, so this assumes/)).toBeInTheDocument();
  });

  it('says the scheduled time has passed', async () => {
    const b = preDraft({ start_time: Date.now() - day });
    renderApp({ linked, api: apiWith(b), sleeper: sleeperFor(b.drafts[0]!), buildTakes: stubBuildTakes() });
    expect(await screen.findByText(/the scheduled draft time has passed/)).toBeInTheDocument();
  });

  it('copes with a draft type the mock cannot run, and with the rankings failing', async () => {
    const b = preDraft({ type: 'auction' });
    renderApp({ linked, api: apiWith(b), sleeper: sleeperFor(b.drafts[0]!), buildTakes: stubBuildTakes() });
    expect(await screen.findByText(/the quick mock could not run\. Draft type "auction" is not supported/)).toBeInTheDocument();
    cleanup();
    const ok = preDraft();
    renderApp({ linked, api: apiWith(ok), sleeper: sleeperFor(ok.drafts[0]!, { projectionsFail: true }), buildTakes: stubBuildTakes() });
    expect(await screen.findAllByText(/could not load the rankings\. Sleeper projections are down/)).not.toHaveLength(0);
  });

  it('previews against a league that is already in season', async () => {
    renderApp({ linked, route: '/?phase=pre_draft', sleeper: createFakeSleeper({ draft: { ...draftOf(), status: 'complete', start_time: null } }), buildTakes: stubBuildTakes() });
    expect(await screen.findByText('previewing: pre-draft')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'draft countdown' })).toBeInTheDocument();
    expect(screen.getByText(/no draft time is set yet/)).toBeInTheDocument();
  });

  describe('countdown ticking', () => {
    it('updates by the minute without animating', () => {
      vi.useFakeTimers();
      const t0 = new Date(2026, 7, 20, 12, 0, 0).getTime();
      vi.setSystemTime(t0);
      render(<MemoryRouter><Countdown draft={draftOf({ start_time: t0 + 2 * 3_600_000 + 5_000 })} /></MemoryRouter>);
      expect(screen.getByRole('timer')).toHaveTextContent('2h 0m');
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(screen.getByRole('timer')).toHaveTextContent('1h 59m');
      act(() => { vi.advanceTimersByTime(118 * 60_000); });
      expect(screen.getByRole('timer')).toHaveTextContent('1m');
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(screen.getByRole('timer')).toHaveTextContent('under a minute');
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(screen.getByText(/the scheduled draft time has passed/)).toBeInTheDocument();
    });

    it('stops its timer when it unmounts', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const { unmount } = render(<MemoryRouter><Countdown draft={draftOf({ start_time: 10 * 3_600_000 })} /></MemoryRouter>);
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe('huddle: drafting', () => {
  const live = (status: SleeperDraft['status']) => bundleWith((b) => {
    b.league.status = 'drafting';
    b.drafts = [{ draft_id: 'L1-draft', league_id: 'L1', season: '2026', status, type: 'snake', start_time: null, settings: { teams: 6, rounds: 6 }, draft_order: { u1: 4 } }];
  });

  it('shows an on-the-clock banner that opens the draft room', async () => {
    const { user } = renderApp({ linked, api: apiWith(live('drafting')), buildTakes: stubBuildTakes() });
    const banner = (await screen.findByRole('heading', { level: 2, name: 'on the clock' })).closest('section')!;
    expect(banner).toHaveTextContent('the draft is live');
    expect(banner).toHaveTextContent('you pick from slot 4.');
    expect(within(banner).getByRole('link', { name: 'open on the clock →' })).toHaveAttribute('href', '/draft?tab=live');
    expect(screen.queryByRole('heading', { name: 'playoff odds' })).not.toBeInTheDocument();
    await user.click(within(banner).getByRole('link', { name: 'open the draft room' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'draft room' })).toBeInTheDocument();
  });

  it('says when the draft is paused', async () => {
    renderApp({ linked, api: apiWith(live('paused')), buildTakes: stubBuildTakes() });
    expect(await screen.findByText('the draft is paused')).toBeInTheDocument();
  });

  it('can be previewed', async () => {
    renderApp({ linked, route: '/?phase=drafting', buildTakes: stubBuildTakes() });
    expect(await screen.findByRole('heading', { level: 2, name: 'on the clock' })).toBeInTheDocument();
    expect(screen.getByText('previewing: draft day')).toBeInTheDocument();
  });
});
