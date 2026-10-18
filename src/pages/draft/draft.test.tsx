import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/testUtils';
import type { DraftPick, LeagueBundle, SleeperDraft, SleeperLeague } from '../../data';
import { buildRankings } from '../../engine';
import {
  FAKE_AS_OF, createFakeApi, createFakeSleeper, sampleAccount, sampleBundle, sampleDraft, sampleDraftPicks, sampleLeague, sampleSeasonProjections,
} from '../../test/fakes';
import { mockKey } from './mockSession';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

const linked = [sampleAccount()];

interface Setup {
  draft?: SleeperDraft | null;
  picks?: DraftPick[];
  league?: (l: SleeperLeague) => void;
  fantasyCalcFails?: boolean;
  route?: string;
}

function mount(o: Setup = {}) {
  const league = structuredClone(sampleLeague);
  o.league?.(league);
  const bundle: LeagueBundle = sampleBundle(league);
  const draft = o.draft === undefined ? sampleDraft() : o.draft;
  bundle.drafts = draft ? [draft] : [];
  const api = createFakeApi();
  api.leagueBundle.mockResolvedValue({ data: bundle, asOf: FAKE_AS_OF, fromCache: false, stale: false });
  const sleeper = createFakeSleeper({ draft, picks: o.picks, fantasyCalcFails: o.fantasyCalcFails });
  const utils = renderApp({ linked, api, sleeper, route: o.route ?? '/draft' });
  return { ...utils, bundle, sleeper, api };
}

const dynasty = (l: SleeperLeague) => { l.settings = { ...l.settings, type: 2 }; };
const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section')!;
const rankingRows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('tr[data-pid]')];
const pids = (c: HTMLElement) => rankingRows(c).map((r) => r.dataset.pid!);
const synthetic = () => buildRankings({ projections: sampleSeasonProjections(), league: sampleLeague, mode: 'redraft', players: null, fantasyCalc: null });

describe('draft room: rankings', () => {
  it('lists players by rank with tiers, tier breaks, replacement levels, ADP and value vs ADP', async () => {
    const { container } = mount();
    const table = await screen.findByRole('table', { name: 'Draft rankings' });
    const r = synthetic();
    const ids = pids(container);
    expect(ids.slice(0, 5)).toEqual(r.rows.slice(0, 5).map((x) => x.pid));
    expect(screen.getAllByTestId('tier-break').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('tier-break')[0]).toHaveTextContent(/\w+ tier 2/);
    expect(screen.getByText(`replacement: rb ${r.replacement.RB!.toFixed(1)} pts`)).toBeInTheDocument();
    expect(screen.getByText(/replacement: wr \d+\.\d pts/)).toBeInTheDocument();
    const first = within(table).getAllByRole('row').find((x) => x.dataset.pid === r.rows[0]!.pid)!;
    expect(within(first).getByText(`t${r.rows[0]!.tier}`)).toBeInTheDocument();
    expect(within(first).getByText(r.rows[0]!.adp!.toFixed(1))).toBeInTheDocument();
    expect(screen.getByText('adp: adp_ppr')).toBeInTheDocument();
    // a positive value vs ADP is green, a negative one red
    const pos = r.rows.find((x) => x.valueVsAdp != null && x.valueVsAdp > 0.5)!;
    const neg = r.rows.find((x) => x.valueVsAdp != null && x.valueVsAdp < -0.5)!;
    const cellOf = (pid: string) => container.querySelector(`tr[data-pid="${pid}"] td:nth-child(9) span`)!;
    expect(cellOf(pos.pid)).toHaveClass('pos-c');
    expect(cellOf(neg.pid)).toHaveClass('neg-c');
  });

  it('filters by position, rookies and search, and sorts without tier rules', async () => {
    const { container, user } = mount();
    await screen.findByRole('table', { name: 'Draft rankings' });
    await user.click(screen.getByRole('radio', { name: 'rb' }));
    expect(pids(container).every((p) => p.startsWith('RB'))).toBe(true);
    // one position: a rule before every tier, tier 1 included
    expect(screen.getAllByTestId('tier-break')[0]).toHaveTextContent('rb tier 1');
    await user.click(screen.getByRole('radio', { name: 'all' }));

    await user.click(screen.getByRole('checkbox', { name: /rookies only/ }));
    const rookies = new Set(['RB4', 'RB9', 'WR3', 'WR8', 'QB5']);
    expect(pids(container).length).toBeGreaterThan(0);
    expect(pids(container).every((p) => rookies.has(p))).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /rookies only/ }));

    await user.type(screen.getByRole('searchbox', { name: 'search rankings' }), 'wr1');
    expect(pids(container).length).toBeGreaterThan(1);
    expect(pids(container).every((p) => p.startsWith('WR1'))).toBe(true);
    await user.clear(screen.getByRole('searchbox', { name: 'search rankings' }));

    await user.click(screen.getByRole('button', { name: 'proj pts' }));
    expect(screen.queryAllByTestId('tier-break')).toHaveLength(0);
  });

  it('offers “hide drafted” once the draft has picks, and removes those players', async () => {
    const draft = sampleDraft({ status: 'complete' });
    const picks = sampleDraftPicks(draft, 6);
    const { container, user } = mount({ draft, picks });
    await screen.findByRole('table', { name: 'Draft rankings' });
    const box = screen.getByRole('checkbox', { name: 'hide drafted (6)' });
    expect(pids(container)).toContain(picks[0]!.player_id);
    await user.click(box);
    expect(pids(container)).not.toContain(picks[0]!.player_id);
    expect(pids(container).length).toBeGreaterThan(0);
  });

  it('has no hide-drafted box before the draft starts', async () => {
    mount();
    await screen.findByRole('table', { name: 'Draft rankings' });
    expect(screen.queryByRole('checkbox', { name: /hide drafted/ })).not.toBeInTheDocument();
  });

  it('stars a player onto the watchlist', async () => {
    const { user } = mount();
    await screen.findByRole('table', { name: 'Draft rankings' });
    const name = synthetic().rows[0]!.name;
    const star = screen.getByRole('button', { name: `watch ${name}` });
    await user.click(star);
    expect(screen.getByRole('button', { name: `watching ${name}` })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('draft room: modes', () => {
  it('a redraft league shows its mode and hides the selector behind “explore”; switching changes the ADP chip', async () => {
    const { user } = mount();
    await screen.findByText('adp: adp_ppr');
    expect(screen.queryByRole('radiogroup', { name: 'Draft mode' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'explore startup and rookie values' }));
    await user.click(screen.getByRole('radio', { name: 'startup' }));
    expect(await screen.findByText('adp: adp_dynasty_ppr')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'rookie' }));
    expect(await screen.findByText('adp: adp_rookie')).toBeInTheDocument();
    expect(screen.getByText(/exploring rookie values/)).toBeInTheDocument();
    expect(screen.getByText('values: fantasycalc')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'back to redraft' }));
    expect(await screen.findByText('adp: adp_ppr')).toBeInTheDocument();
    expect(screen.queryByText('values: fantasycalc')).not.toBeInTheDocument();
  });

  it('a dynasty league defaults to startup (dynasty ADP and FantasyCalc) and can switch to rookie', async () => {
    const { user, container } = mount({ league: dynasty });
    expect(await screen.findByText('adp: adp_dynasty_ppr')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'startup' })).toBeChecked();
    expect(screen.getByText('values: fantasycalc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'fc value' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'rookie' }));
    expect(await screen.findByText('adp: adp_rookie')).toBeInTheDocument();
    await waitFor(() => expect(pids(container).every((p) => ['RB4', 'RB9', 'WR3', 'WR8', 'QB5'].includes(p))).toBe(true));
  });

  it('a rookie draft (player_type 1) opens in rookie mode', async () => {
    mount({ league: dynasty, draft: sampleDraft({ settings: { teams: 6, rounds: 4, player_type: 1 } }) });
    expect(await screen.findByText('adp: adp_rookie')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'rookie' })).toBeChecked();
  });

  it('degrades quietly when FantasyCalc is down', async () => {
    mount({ league: dynasty, fantasyCalcFails: true });
    expect(await screen.findByText('adp: adp_dynasty_ppr')).toBeInTheDocument();
    expect(screen.getByText(/fantasycalc is not answering/)).toBeInTheDocument();
    expect(screen.queryByText('values: fantasycalc')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'fc value' })).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Draft rankings' })).toBeInTheDocument();
  });

  it('Refresh refetches the projections, the draft and FantasyCalc', async () => {
    const { user, sleeper } = mount({ league: dynasty });
    await screen.findByText('adp: adp_dynasty_ppr');
    sleeper.seasonProjections.mockClear(); sleeper.fantasyCalc.mockClear(); sleeper.draft.mockClear(); sleeper.draftPicks.mockClear();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(sleeper.fantasyCalc).toHaveBeenCalledWith(expect.anything(), { force: true }));
    expect(sleeper.seasonProjections).toHaveBeenCalledWith('2026', expect.anything(), { force: true });
    expect(sleeper.draft).toHaveBeenCalledWith('L1-draft', { force: true });
    expect(sleeper.draftPicks).toHaveBeenCalledWith('L1-draft', { force: true });
  });
});

describe('draft room: mock draft', () => {
  const onMock = (o: Setup = {}) => mount({ route: '/draft?tab=mock', ...o });
  const status = () => screen.getAllByRole('status').find((e) => /of 24|on the clock|draft complete/.test(e.textContent ?? ''))!;

  it('starts at my real slot: sim to my pick, then a pick moves the draft to the next team', async () => {
    const { user } = onMock();
    await screen.findByRole('heading', { level: 2, name: 'mock draft' });
    expect(screen.getByRole('combobox', { name: 'Your draft slot' })).toHaveValue('3');
    expect(screen.getByText(/pick 1 of 24 · Sunday Scaries is on the clock/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Draft / })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'sim to my pick' }));
    await waitFor(() => expect(status()).toHaveTextContent('you’re on the clock · pick 3'));
    expect(screen.getByRole('button', { name: 'sim to my pick' })).toBeDisabled();
    const best = within(section('best available'));
    const buttons = best.getAllByRole('button', { name: /^Draft / });
    const name = buttons[0]!.getAttribute('aria-label')!.replace(/^Draft /, '');
    await user.click(buttons[0]!);
    await waitFor(() => expect(status()).toHaveTextContent(/pick 4 of 24 · Fourth and Long is on the clock/));
    expect(within(section('your picks')).getByRole('link', { name })).toBeInTheDocument();
    // the drafted player is gone from best available
    expect(within(section('best available')).queryByRole('link', { name })).not.toBeInTheDocument();
  });

  it('sim the rest finishes the draft and shows the grade, rank, points vs the median, lineup by position, steals and reaches', async () => {
    const { user } = onMock();
    await screen.findByRole('heading', { level: 2, name: 'mock draft' });
    await user.click(screen.getByRole('button', { name: 'sim the rest' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'your draft grade' })).toBeInTheDocument();
    const card = section('your draft grade');
    expect(within(card).getByLabelText(/^Grade [A-DF][+-]?$/)).toBeInTheDocument();
    expect(within(card).getByText('lineup rank')).toBeInTheDocument();
    expect(within(card).getByText(/of 6/)).toBeInTheDocument();
    expect(within(card).getByText('vs the median team')).toBeInTheDocument();
    const lineup = within(card).getByRole('table', { name: /starting lineup by position/i });
    for (const slot of ['qb', 'rb', 'wr', 'te', 'flex', 'k', 'def']) expect(within(lineup).getByRole('cell', { name: slot })).toBeInTheDocument();
    expect(within(card).getByRole('heading', { name: 'steals' })).toBeInTheDocument();
    expect(within(card).getByRole('heading', { name: 'reaches' })).toBeInTheDocument();
    expect(within(card).getAllByRole('table', { name: /projected lineup points/i })).toHaveLength(1);
    expect(screen.getByText(/draft complete · 24 picks/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'best available' })).not.toBeInTheDocument();
    // the board is full: 24 cells with a player in them
    const board = screen.getByRole('table', { name: 'Mock draft board' });
    expect(board.querySelectorAll('td.cell:not(.empty)')).toHaveLength(24);
  });

  it('undo takes back my last pick (and the bots’ picks after it)', async () => {
    const { user } = onMock();
    await screen.findByRole('heading', { level: 2, name: 'mock draft' });
    expect(screen.getByRole('button', { name: 'undo last pick' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'sim to my pick' }));
    await waitFor(() => expect(status()).toHaveTextContent('you’re on the clock · pick 3'));
    await user.click(within(section('best available')).getAllByRole('button', { name: /^Draft / })[0]!);
    await waitFor(() => expect(status()).toHaveTextContent(/pick 4 of 24/));
    await user.click(screen.getByRole('button', { name: 'sim to my pick' }));
    await waitFor(() => expect(status()).toHaveTextContent('you’re on the clock · pick 10'));
    await user.click(within(section('best available')).getAllByRole('button', { name: /^Draft / })[0]!);
    await waitFor(() => expect(status()).toHaveTextContent(/pick 11 of 24/));
    expect(within(section('your picks')).getAllByRole('listitem')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'undo last pick' }));
    expect(status()).toHaveTextContent('you’re on the clock · pick 10');
    expect(within(section('your picks')).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'undo last pick' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'undo last pick' }));
    expect(status()).toHaveTextContent('you’re on the clock · pick 3');
    expect(screen.getByText(/nobody yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'undo last pick' })).toBeDisabled();
  });

  it('restart keeps the seed, reroll changes it, and another slot starts the clock there', async () => {
    const { user } = onMock();
    await screen.findByRole('heading', { level: 2, name: 'mock draft' });
    const seed = () => screen.getByText(/^seed \d+$/).textContent;
    const first = seed();
    await user.click(screen.getByRole('button', { name: 'sim to my pick' }));
    await waitFor(() => expect(status()).toHaveTextContent('you’re on the clock'));
    await user.click(screen.getByRole('button', { name: 'restart' }));
    expect(seed()).toBe(first);
    expect(screen.getByText(/pick 1 of 24/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'reroll' }));
    expect(seed()).not.toBe(first);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Your draft slot' }), '1');
    expect(status()).toHaveTextContent('you’re on the clock · pick 1');
  });

  it('keeps an in-progress mock in localStorage and restores it, seed and all', async () => {
    const first = onMock();
    await screen.findByRole('heading', { level: 2, name: 'mock draft' });
    await first.user.click(screen.getByRole('button', { name: 'sim to my pick' }));
    await waitFor(() => expect(status()).toHaveTextContent('you’re on the clock · pick 3'));
    const pickBtn = within(section('best available')).getAllByRole('button', { name: /^Draft / })[2]!;
    const name = pickBtn.getAttribute('aria-label')!.replace(/^Draft /, '');
    await first.user.click(pickBtn);
    await waitFor(() => expect(status()).toHaveTextContent(/pick 4 of 24/));
    const seed = screen.getByText(/^seed \d+$/).textContent;
    const saved = JSON.parse(window.localStorage.getItem(mockKey('L1'))!) as { log: unknown[]; seed: number; slot: number; mode: string };
    expect(saved).toMatchObject({ slot: 3, mode: 'redraft' });
    expect(saved.log).toHaveLength(3);

    first.unmount();
    onMock();
    await screen.findByRole('heading', { level: 2, name: 'mock draft' });
    expect(screen.getByText(/^seed \d+$/).textContent).toBe(seed);
    expect(status()).toHaveTextContent(/pick 4 of 24/);
    expect(within(section('your picks')).getByRole('link', { name })).toBeInTheDocument();
  });

  it('ignores a damaged saved mock and starts fresh', async () => {
    window.localStorage.setItem(mockKey('L1'), '{"v":1,"nope":true');
    onMock();
    expect(await screen.findByText(/pick 1 of 24/)).toBeInTheDocument();
    window.localStorage.setItem(mockKey('L1'), JSON.stringify({ v: 1, mode: 'redraft', slot: 3, seed: 5, teams: 6, rounds: 4, log: [['NOPE', 0]], at: 1 }));
    cleanup();
    onMock();
    expect(await screen.findByText(/pick 1 of 24/)).toBeInTheDocument();
  });

  it('keeps going when localStorage is unavailable', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    try {
      const { user } = onMock();
      await screen.findByRole('heading', { level: 2, name: 'mock draft' });
      await user.click(screen.getByRole('button', { name: 'sim to my pick' }));
      await waitFor(() => expect(status()).toHaveTextContent('you’re on the clock'));
    } finally {
      spy.mockRestore();
    }
  });

  it('a saved mock for another mode is offered, not overwritten', async () => {
    window.localStorage.setItem(mockKey('L1'), JSON.stringify({ v: 1, mode: 'rookie', slot: 2, seed: 9, teams: 6, rounds: 4, log: [], at: 1 }));
    onMock();
    await screen.findByRole('heading', { level: 2, name: 'mock draft' });
    expect(screen.queryByRole('button', { name: 'resume it' })).not.toBeInTheDocument(); // an empty one is not worth resuming
    cleanup();
    window.localStorage.setItem(mockKey('L1'), JSON.stringify({ v: 1, mode: 'rookie', slot: 2, seed: 9, teams: 6, rounds: 4, log: [['WR3', 0]], at: 1 }));
    onMock();
    expect(await screen.findByRole('button', { name: 'resume it' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(mockKey('L1'))!).mode).toBe('rookie');
  });

  it('works with no draft at all: a snake of the league’s size, in any slot', async () => {
    const { user } = mount({ route: '/draft?tab=mock', draft: null });
    await screen.findByRole('heading', { level: 2, name: 'mock draft' });
    expect(screen.getByText(/snake · 6 teams · 12 rounds/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'sim the rest' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'your draft grade' })).toBeInTheDocument();
  });

  it('linear drafts do not snake back', async () => {
    mount({ route: '/draft?tab=mock', draft: sampleDraft({ type: 'linear' }) });
    await screen.findByRole('heading', { level: 2, name: 'mock draft' });
    expect(screen.getByText(/linear · 6 teams · 4 rounds/)).toBeInTheDocument();
    const board = screen.getByRole('table', { name: 'Mock draft board' });
    const row2 = within(board).getAllByRole('row')[2]!;
    expect(row2.querySelector('td .cm')).toHaveTextContent('2.01');
  });
});

describe('draft room: on the clock', () => {
  const live = (picks: number, o: Setup = {}) => {
    const draft = sampleDraft({ status: 'drafting' });
    return mount({ route: '/draft', draft, picks: sampleDraftPicks(draft, picks), ...o });
  };

  it('opens on the live assistant while the draft is on, polling sleeper with force', async () => {
    const { sleeper } = live(2);
    expect(await screen.findByRole('heading', { level: 2, name: 'on the clock' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'on the clock' })).toBeChecked();
    expect(await screen.findByText('live')).toBeInTheDocument();
    expect(await screen.findByText(/last update \d\d:\d\d:\d\d/)).toBeInTheDocument();
    expect(sleeper.draftPicks).toHaveBeenCalledWith('L1-draft', { force: true });
    expect(screen.getByText(/pick 2 of 24 made/)).toBeInTheDocument();
  });

  it('shows “you’re on the clock” when it is my pick, and the panels from the live snapshot', async () => {
    const draft = sampleDraft({ status: 'drafting' });
    const picks = sampleDraftPicks(draft, 2);
    mount({ draft, picks });
    expect(await screen.findByRole('heading', { level: 2, name: 'you’re on the clock' })).toBeInTheDocument();
    expect(screen.getByText(/pick 3 · round 1, slot 3/)).toBeInTheDocument();
    expect(screen.getByText('you’re on the clock at pick 3.')).toBeInTheDocument();
    // best available hides the two drafted players
    const r = synthetic();
    const best = within(section('best available'));
    for (const p of picks) expect(best.queryByRole('link', { name: r.byPid[p.player_id]!.name })).not.toBeInTheDocument();
    // positional runs, needs, likely gone, feed and roster are all there
    expect(screen.getByRole('heading', { level: 2, name: 'positional runs' })).toBeInTheDocument();
    expect(within(section('your needs')).getByLabelText('Open starting slots')).toHaveTextContent('qb');
    expect(within(section('likely gone')).getByText(/you’re up/)).toBeInTheDocument();
    const feed = screen.getByRole('list', { name: 'Pick feed' });
    expect(within(feed).getAllByRole('listitem')).toHaveLength(2);
    expect(feed).toHaveTextContent(/(value|reach|on adp|no adp)/);
    expect(within(section('your roster so far')).getByText('no picks yet.')).toBeInTheDocument();
  });

  it('counts the picks to my turn and lists who is likely gone by then', async () => {
    live(4);
    expect(await screen.findByText('your next pick is #10, 5 picks away.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'you’re on the clock' })).not.toBeInTheDocument();
    const gone = within(section('likely gone')).getByRole('list', { name: 'Likely gone before your pick' });
    expect(within(gone).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(gone).toHaveTextContent(/\d+% gone/);
  });

  it('flags a run: four running backs in the last five picks', async () => {
    const draft = sampleDraft({ status: 'drafting' });
    const r = synthetic();
    const rbs = r.rows.filter((x) => x.pos === 'RB').slice(0, 5);
    const picks: DraftPick[] = rbs.map((x, i) => ({ round: 1, pick_no: i + 1, player_id: x.pid, roster_id: i + 1 }));
    mount({ draft, picks });
    expect(await screen.findByText('rb run: 5 of the last 5 picks')).toBeInTheDocument();
  });

  it('shows a quiet status line when sleeper stops answering', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const draft = sampleDraft({ status: 'drafting' });
    const { sleeper } = mount({ draft, picks: [] });
    await screen.findByRole('heading', { level: 2, name: 'on the clock' });
    sleeper.draftPicks.mockRejectedValue(new Error('network down'));
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(await screen.findByText(/sleeper did not answer \(network down\)\. trying again in 8 s\./)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(await screen.findByText(/trying again in 16 s\./)).toBeInTheDocument();
    sleeper.draftPicks.mockResolvedValue({ data: sampleDraftPicks(draft, 1), asOf: FAKE_AS_OF, fromCache: false, stale: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(16_100); });
    expect(await screen.findByText(/pick 1 of 24 made/)).toBeInTheDocument();
    expect(screen.queryByText(/sleeper did not answer/)).not.toBeInTheDocument();
  });

  it('picks up a draft that starts while the page is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const draft = sampleDraft({ status: 'pre_draft' });
    const { sleeper } = mount({ draft, route: '/draft?tab=clock' });
    expect(await screen.findByText(/no draft in progress/)).toBeInTheDocument();
    sleeper.draft.mockResolvedValue({ data: { ...draft, status: 'drafting' }, asOf: FAKE_AS_OF, fromCache: false, stale: false });
    sleeper.draftPicks.mockResolvedValue({ data: sampleDraftPicks(draft, 1), asOf: FAKE_AS_OF, fromCache: false, stale: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_500); });
    expect(await screen.findByText('live')).toBeInTheDocument();
    expect(screen.getByText(/pick 1 of 24 made/)).toBeInTheDocument();
  });

  it('says so when there is no draft to follow or replay', async () => {
    mount({ route: '/draft?tab=clock', draft: sampleDraft({ status: 'pre_draft' }) });
    expect(await screen.findByText('no draft in progress. the assistant wakes up when your league’s draft starts.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'replay your draft' })).not.toBeInTheDocument();
  });

  it('says so when the league has no draft at all', async () => {
    mount({ route: '/draft?tab=clock', draft: null });
    expect(await screen.findByText(/no draft in progress/)).toBeInTheDocument();
  });

  it('accepts ?tab=live as an alias for on the clock', async () => {
    mount({ route: '/draft?tab=live', draft: null });
    expect(await screen.findByText(/no draft in progress/)).toBeInTheDocument();
  });

  it('asks for the draft’s own mode when another one is being explored', async () => {
    const { user } = live(2);
    await screen.findByText('live');
    await user.click(screen.getByRole('button', { name: 'explore startup and rookie values' }));
    await user.click(screen.getByRole('radio', { name: 'rookie' }));
    await screen.findByText('adp: adp_rookie');
    expect(await screen.findByText(/your league’s draft is a redraft draft, but the room is showing rookie values/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'use redraft rankings' }));
    expect(await screen.findByText(/pick 2 of 24 made/)).toBeInTheDocument();
  });
});

describe('draft room: replay of a finished draft', () => {
  const finished = () => {
    const draft = sampleDraft({ status: 'complete' });
    const picks = sampleDraftPicks(draft);
    return { picks, ...mount({ route: '/draft?tab=clock', draft, picks }) };
  };

  it('offers to replay a completed draft, and runs it through the same panels with a replay chip', async () => {
    const { user } = finished();
    expect(await screen.findByText(/your league’s draft is complete \(24 picks\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'replay your draft' }));
    expect(await screen.findByText('replay')).toBeInTheDocument();
    expect(screen.queryByText('live')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1 pick/s' })).toBeChecked();
    expect(screen.getByText(/waiting for the first pick/)).toBeInTheDocument();
  });

  it('steps one pick at a time; every panel moves with each pick', async () => {
    const { user, picks } = finished();
    await user.click(await screen.findByRole('button', { name: 'replay your draft' }));
    await user.click(screen.getByRole('radio', { name: 'step' }));
    const r = synthetic();
    const feedNames = () => within(screen.getByRole('list', { name: 'Pick feed' })).getAllByRole('listitem').map((li) => li.textContent);
    for (let n = 1; n <= 4; n++) {
      await user.click(screen.getByRole('button', { name: 'next pick' }));
      expect(await screen.findByText(`pick ${n} of 24 made`)).toBeInTheDocument();
      expect(feedNames()).toHaveLength(n);
      expect(feedNames()[0]).toContain(`#${n}`);
      expect(feedNames()[0]).toContain(r.byPid[picks[n - 1]!.player_id]!.name);
      // the drafted player leaves best available
      expect(within(section('best available')).queryByRole('link', { name: r.byPid[picks[n - 1]!.player_id]!.name })).not.toBeInTheDocument();
    }
    // my pick (slot 3) comes up after two picks: the banner says so, marked as a replay
    await user.click(screen.getByRole('button', { name: 'restart' }));
    await user.click(screen.getByRole('radio', { name: 'step' }));
    await user.click(screen.getByRole('button', { name: 'next pick' }));
    expect(screen.queryByRole('heading', { level: 2, name: 'you’re on the clock' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'next pick' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'you’re on the clock' })).toBeInTheDocument();
    expect(screen.getByText('replay · this is not live')).toBeInTheDocument();
  });

  it('plays on its own at the chosen speed and finishes with the whole draft on the board', async () => {
    const { user } = finished();
    await user.click(await screen.findByRole('button', { name: 'replay your draft' }));
    await user.click(screen.getByRole('radio', { name: '10 picks/s' }));
    expect(await screen.findByText(/draft complete · 24 of 24 picks/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'next pick' })).toBeDisabled();
    expect(within(section('your roster so far')).getAllByRole('listitem')).toHaveLength(4);
    const board = screen.getByRole('table', { name: 'Draft board' });
    expect(board.querySelectorAll('td.cell:not(.empty)')).toHaveLength(24);
    await user.click(screen.getByRole('button', { name: 'exit replay' }));
    expect(await screen.findByRole('button', { name: 'replay your draft' })).toBeInTheDocument();
  }, 15_000);

  it('pauses and resumes', async () => {
    const { user } = finished();
    await user.click(await screen.findByRole('button', { name: 'replay your draft' }));
    await user.click(screen.getByRole('radio', { name: '10 picks/s' }));
    await screen.findByText(/pick \d+ of 24 made/);
    await user.click(screen.getByRole('button', { name: 'pause' }));
    const at = screen.getByText(/pick \d+ of 24 made/).textContent;
    await act(async () => { await new Promise((r) => { setTimeout(r, 400); }); });
    expect(screen.getByText(/pick \d+ of 24 made/).textContent).toBe(at);
    fireEvent.click(screen.getByRole('button', { name: 'play' }));
    await waitFor(() => expect(screen.getByText(/pick \d+ of 24 made|draft complete/).textContent).not.toBe(at));
  });
});
