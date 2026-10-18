import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../app/testUtils';
import { ageOf, buildPlayerIndex, searchPlayers } from '../app/playersIndex';
import { WATCHLIST_KEY } from '../app/watchlist';
import { createFakeNflverse, createFakeSleeper, sampleAccount, samplePlayersFile } from '../test/fakes';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const linked = [sampleAccount()];

describe('player index', () => {
  const index = buildPlayerIndex(samplePlayersFile(), Date.UTC(2026, 9, 16));

  it('keeps fantasy positions only', () => {
    expect(index.some((e) => e.pos === 'OL')).toBe(false);
    expect(index.find((e) => e.pid === 'd1')?.pos).toBe('DEF');
    expect(index.find((e) => e.pid === 'x1')?.active).toBe(false);
    expect(index.find((e) => e.pid === 't1wr')).toMatchObject({ name: 'Walt Wideout', team: 'CCC', active: true, injury: 'Questionable', age: 26 });
  });

  it('computes age from the birth date', () => {
    expect(ageOf({ birth_date: '2000-03-04' }, Date.UTC(2026, 9, 16))).toBe(26);
    expect(ageOf({ birth_date: '2000-12-31' }, Date.UTC(2026, 9, 16))).toBe(25);
    expect(ageOf({ age: 31 })).toBe(31);
    expect(ageOf({})).toBeNull();
  });

  it('ranks names that start with the query first, then last names, then active players', () => {
    const names = searchPlayers(index, { query: 'wide' }).map((e) => e.name);
    expect(names.slice(0, 2)).toEqual(['Walt Wideout', 'Backup Wideout'].sort((a, b) => names.indexOf(a) - names.indexOf(b)));
    expect(searchPlayers(index, { query: 'wal' })[0]!.name).toMatch(/^Walt|^Walter/);
    expect(searchPlayers(index, { query: 'old timer' })[0]!.active).toBe(false);
    expect(searchPlayers(index, { query: 'zzzz' })).toEqual([]);
    expect(searchPlayers(index, { pos: 'RB' }).map((e) => e.pos)).toEqual(['RB', 'RB']);
    expect(searchPlayers(index, { only: new Set(['t1qb']) }).map((e) => e.pid)).toEqual(['t1qb']);
    expect(searchPlayers(index, { query: 'a', limit: 2 })).toHaveLength(2);
  });
});

describe('scouting report search (/players)', () => {
  it('searches by name, team or position and filters by position', async () => {
    const { user } = renderApp({ linked, route: '/players' });
    expect(await screen.findByRole('heading', { level: 1, name: 'scouting report' })).toBeInTheDocument();
    expect(screen.getByText('every player, every split')).toBeInTheDocument();
    expect(await screen.findByText(/^11 players on file/)).toBeInTheDocument(); // the offensive-line entry is left out (the count sits behind the title's ?)
    expect(screen.getByText(/type a name, or pick a position or scope/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('search players'), 'wal');
    const table = await screen.findByRole('table', { name: 'Player search results' });
    expect(within(table).getByText('Walt Wideout')).toBeInTheDocument();
    expect(within(table).getByText('Walter Wide')).toBeInTheDocument();
    expect(within(table).getByText('Questionable')).toBeInTheDocument();
    expect(within(table).queryByText('Rex Runner')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('search players'));
    await user.click(screen.getByRole('radio', { name: 'RB' }));
    expect(within(await screen.findByRole('table', { name: 'Player search results' })).getAllByRole('row')).toHaveLength(1 + 2);
  });

  it('filters by ownership from the model: my team, rostered, free agents', async () => {
    const { user } = renderApp({ linked, route: '/players' });
    await screen.findByText(/players on file/);
    await waitFor(() => expect(screen.queryByText(/your league is still loading/)).not.toBeInTheDocument());

    await user.click(screen.getByRole('radio', { name: 'my team' }));
    let table = await screen.findByRole('table', { name: 'Player search results' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(1 + 4));
    expect(within(table).getByText('Alex Arm')).toBeInTheDocument();
    expect(within(table).getAllByText('my team').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('radio', { name: 'free agents' }));
    table = await screen.findByRole('table', { name: 'Player search results' });
    expect(within(table).getByText('Free Agent Fran')).toBeInTheDocument();
    expect(within(table).getByText('Walter Wide')).toBeInTheDocument(); // not rostered, not in the model
    expect(within(table).queryByText('Alex Arm')).not.toBeInTheDocument();
    expect(within(table).queryByText('Old Timer')).not.toBeInTheDocument(); // retired

    await user.click(screen.getByRole('radio', { name: 'rostered' }));
    table = await screen.findByRole('table', { name: 'Player search results' });
    expect(within(table).getByText('Reed Receiver')).toBeInTheDocument();
    expect(within(table).getAllByText('Reed Between the Lines').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Free Agent Fran')).not.toBeInTheDocument();
  });

  it('keeps a watchlist in localStorage with a watchlist filter', async () => {
    const { user } = renderApp({ linked, route: '/players' });
    await screen.findByText(/players on file/);
    await user.click(screen.getByRole('radio', { name: 'watchlist' }));
    expect(screen.getByText(/nobody on your watchlist yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'all players' }));
    await user.type(screen.getByLabelText('search players'), 'walt');
    await user.click(await screen.findByRole('button', { name: 'watch Walt Wideout' }));
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY)!)).toEqual(['t1wr']);
    expect(screen.getByRole('button', { name: 'watching Walt Wideout' })).toHaveAttribute('aria-pressed', 'true');

    await user.clear(screen.getByLabelText('search players'));
    await user.click(screen.getByRole('radio', { name: 'watchlist' }));
    const table = await screen.findByRole('table', { name: 'Player search results' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 1);
    await user.click(within(table).getByRole('button', { name: 'watching Walt Wideout' }));
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY)!)).toEqual([]);
  });

  it('opens a profile from a result', async () => {
    const { user } = renderApp({ linked, route: '/players' });
    await user.type(await screen.findByLabelText('search players'), 'reed');
    await user.click(await screen.findByRole('link', { name: 'Reed Receiver' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Reed Receiver' })).toBeInTheDocument();
  });
});

describe('player profile (/players/:pid)', () => {
  it('shows the facts, title and kicker', async () => {
    renderApp({ linked, route: '/players/t1wr' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Walt Wideout' })).toBeInTheDocument();
    expect(screen.getByText('scouting report · WR · CCC')).toBeInTheDocument();
    expect(document.title).toBe('walt wideout · the commish');
    const facts = (await screen.findByRole('heading', { level: 2, name: 'the facts' })).closest('section')!;
    expect(facts).toHaveTextContent('experience3 years');
    expect(facts).toHaveTextContent('injuryQuestionable, Knee');
    expect(facts).toHaveTextContent('depth chartWR 1');
    expect(facts).toHaveTextContent('height6′1″');
    expect(facts).toHaveTextContent('weight210 lb');
    expect(facts).toHaveTextContent('collegeTech');
    await waitFor(() => expect(facts).toHaveTextContent('in your leaguemy team'));
    expect(within(facts).getByText(/^\d\d$/)).toBeInTheDocument(); // age
  });

  it('opens with three figures: this week’s projection, rest-of-season rank and trade value', async () => {
    renderApp({ linked, route: '/players/t1wr' });
    const strip = await screen.findByRole('group', { name: 'Walt Wideout at a glance' });
    const week = within(strip).getByText('week 5 projection').closest('.kpi')!;
    expect(week).toHaveTextContent('12.0');
    expect(week).toHaveTextContent('floor 6.0 · ceiling 18.0');
    const ros = within(strip).getByText('rest of season').closest('.kpi')!;
    expect(ros).toHaveTextContent('WR3');
    expect(ros).toHaveTextContent('36.0 points · of 6 in the pool');
    await waitFor(() => expect(within(strip).getByText('trade value').closest('.kpi')).toHaveTextContent('5,234'));
    expect(within(strip).getByText('trade value').closest('.kpi')).toHaveTextContent('44th overall');
    expect(within(strip).getByText('trade value').closest('.kpi')).toHaveTextContent('−150 in 30 days');
  });

  it('is five tabs: overview, game log, usage, splits and value, and the URL says which is open', async () => {
    const { user } = renderApp({ linked, route: '/players/t1wr' });
    const group = await screen.findByRole('radiogroup', { name: 'Player sections' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['overview', 'game log', 'usage', 'splits', 'value']);
    expect(within(group).getByRole('radio', { name: 'overview' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'game log' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'game log' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'the facts' })).not.toBeInTheDocument();
  });

  it('overview: the facts, the takes and the next opponents', async () => {
    renderApp({ linked, route: '/players/t1wr' });
    const outlook = (await screen.findByRole('heading', { level: 2, name: 'outlook' })).closest('section')!;
    const table = within(outlook).getByRole('table', { name: 'Next opponents' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 3); // weeks 6 to 8
    expect(within(table).getAllByText('YYY')).toHaveLength(3);
    expect(screen.getByRole('heading', { level: 2, name: 'hot takes' })).toBeInTheDocument();
  });

  it('shows the game log with league-scored points and snap share', async () => {
    renderApp({ linked, route: '/players/t1wr?tab=log' });
    const log = (await screen.findByRole('heading', { level: 2, name: 'game log' })).closest('section')!;
    const table = within(log).getByRole('table', { name: 'Game log' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 3 + 1);
    expect(within(table).getByRole('columnheader', { name: 'rec yds' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'pass att' })).not.toBeInTheDocument();
    // the counting stats (targets, snaps) wait behind "more columns"
    expect(within(table).queryByRole('columnheader', { name: 'targets' })).not.toBeInTheDocument();
    expect(within(table).getByText('43.0')).toBeInTheDocument(); // 20 + 7 + 16
    expect(within(table).getAllByText('83%')).toHaveLength(3);
    expect(log).toHaveTextContent('3 games · 14.3 a game');
  });

  it('game log: “more columns” adds targets and the snap counts, and remembers it', async () => {
    const first = renderApp({ linked, route: '/players/t1wr?tab=log' });
    await screen.findByRole('heading', { level: 2, name: 'game log' });
    await first.user.click(screen.getByRole('button', { name: /more columns/ }));
    expect(within(screen.getByRole('table', { name: 'Game log' })).getByRole('columnheader', { name: 'targets' })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Game log' })).getByRole('columnheader', { name: 'snaps' })).toBeInTheDocument();
    first.unmount();
    renderApp({ linked, route: '/players/t1wr?tab=log' });
    expect(within(await screen.findByRole('table', { name: 'Game log' })).getByRole('columnheader', { name: 'targets' })).toBeInTheDocument();
  });

  it('shows FantasyCalc value and the 30-day change on the value tab', async () => {
    renderApp({ linked, route: '/players/t1wr?tab=value' });
    const value = (await screen.findByRole('heading', { level: 2, name: 'trade value' })).closest('section')!;
    await waitFor(() => expect(value).toHaveTextContent('5,234'));
    expect(value).toHaveTextContent('44th overall');
    expect(value).toHaveTextContent('WR18');
    expect(value).toHaveTextContent('−150');
    expect(value).toHaveTextContent('Values: FantasyCalc.');
    expect(value).toHaveTextContent('redraft league settings');
  });

  it('says quietly why values are missing when FantasyCalc is down', async () => {
    renderApp({ linked, route: '/players/t1wr?tab=value', sleeper: createFakeSleeper({ fantasyCalcFails: true }) });
    expect(await screen.findByText(/values are unavailable right now\. .*FantasyCalc is down/)).toBeInTheDocument();
  });

  it('adds and removes the player from the watchlist', async () => {
    const { user } = renderApp({ linked, route: '/players/t1wr' });
    await user.click(await screen.findByRole('button', { name: 'add to watchlist' }));
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY)!)).toEqual(['t1wr']);
    await user.click(screen.getByRole('button', { name: 'on your watchlist' }));
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY)!)).toEqual([]);
  });

  it('handles a player the model does not project, and an unknown id', async () => {
    const { unmount } = renderApp({ linked, route: '/players/x2' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Walter Wide' })).toBeInTheDocument();
    expect(await screen.findByText(/no projection on file for this player/)).toBeInTheDocument();
    // no model row, so no strip either
    expect(screen.queryByRole('group', { name: /at a glance/ })).not.toBeInTheDocument();
    unmount();
    const log = renderApp({ linked, route: '/players/x2?tab=log' });
    expect(await screen.findByText(/no games on file this season/)).toBeInTheDocument();
    log.unmount();
    renderApp({ linked, route: '/players/nope' });
    expect(await screen.findByText('no player on file with that id.')).toBeInTheDocument();
  });

  it('carries the attribution and the nflverse placeholder', async () => {
    renderApp({ linked, route: '/players/t1wr?tab=usage' });
    expect(await screen.findByText('Play-by-play and snap data: nflverse. Charting data: FTN Data via nflverse.')).toBeInTheDocument();
    expect(screen.getByText('nflverse data arrives with the nightly update.')).toBeInTheDocument();
  });
});

describe('player names link to the scouting report', () => {
  it('on Locker Room, Waiver Wire and the Playoff Picture drawer', async () => {
    const a = renderApp({ linked, route: '/team?tab=roster' });
    const roster = await screen.findByRole('table', { name: 'Roster' });
    expect(within(roster).getByRole('link', { name: 'Alex Arm' })).toHaveAttribute('href', '/players/t1qb');
    a.unmount();
    const b = renderApp({ linked, route: '/waivers' });
    const wire = await screen.findByRole('table', { name: 'Waiver wire' });
    expect(within(wire).getByRole('link', { name: 'Free Agent Fran' })).toHaveAttribute('href', '/players/fa1');
    b.unmount();
    const c = renderApp({ linked, route: '/race' });
    await c.user.click(within(await screen.findByRole('table', { name: 'Playoff picture standings' })).getByText('Reed Between the Lines'));
    const dialog = await screen.findByRole('dialog', { name: 'Reed Between the Lines' });
    expect(within(dialog).getByRole('link', { name: 'Reed Receiver' })).toHaveAttribute('href', '/players/t2wr');
    c.unmount();
    const d = renderApp({ linked, route: '/trades?tab=deals' });
    expect(await screen.findByRole('link', { name: 'Reed Receiver' })).toHaveAttribute('href', '/players/t2wr'); // handshake deals
    d.unmount();
    renderApp({ linked, route: '/trades' });
    expect((await screen.findAllByRole('link', { name: /^Scouting report for / })).length).toBeGreaterThan(0); // the analyzer's lists
  });
});

describe('with the nightly nflverse data', () => {
  it('adds the usage panels to a profile: usage on one tab, the splits on another', async () => {
    const { user } = renderApp({ linked, route: '/players/t1wr?tab=usage', nflverse: true });
    expect(await screen.findByRole('heading', { level: 2, name: 'usage trends' })).toBeInTheDocument();
    const usage = await screen.findByRole('table', { name: 'Season usage' });
    expect(within(usage).getByText('target share').closest('tr')).toHaveTextContent('26.0%');
    expect(screen.queryByRole('table', { name: 'Charting splits' })).not.toBeInTheDocument();
    expect(screen.queryByText('nflverse data arrives with the nightly update.')).not.toBeInTheDocument();
    // why a split is hidden sits beside its sample, not in a column of its own
    expect(within(usage).queryByRole('columnheader', { name: 'note' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'splits' }));
    expect(await screen.findByRole('table', { name: 'Charting splits' })).toBeInTheDocument();
    expect(screen.getByText('last season (2025)')).toBeInTheDocument();
    expect(screen.getByText(/Routes are a proxy/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Rushing box splits' })).not.toBeInTheDocument(); // a receiver
  });

  it('Refresh also requests the nflverse files again, forced', async () => {
    const nflverse = createFakeNflverse();
    const { user, sleeper } = renderApp({ linked, route: '/players/t1wr?tab=usage', nflverse });
    await screen.findByRole('heading', { level: 2, name: 'usage trends' });
    expect(nflverse.manifest).toHaveBeenLastCalledWith({ force: undefined });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(nflverse.manifest).toHaveBeenLastCalledWith({ force: true }));
    expect(nflverse.weekly).toHaveBeenLastCalledWith(undefined, { force: true });
    expect(nflverse.season).toHaveBeenLastCalledWith(undefined, { force: true });
    expect(nflverse.coverage).toHaveBeenLastCalledWith({ force: true });
    expect(nflverse.unmatched).toHaveBeenLastCalledWith({ force: true });
    expect(sleeper.players).toHaveBeenLastCalledWith({ force: true });
  });

  it('says the data arrives with the nightly update when the files are missing', async () => {
    renderApp({ linked, route: '/players/t1wr?tab=usage', nflverse: createFakeNflverse({ missing: true }) });
    expect(await screen.findByText('nflverse data arrives with the nightly update.')).toBeInTheDocument();
  });

  it('a player with no rows in the files gets a quiet note', async () => {
    renderApp({ linked, route: '/players/t1qb?tab=usage', nflverse: true });
    expect(await screen.findByText('no nflverse usage on file for this player yet.')).toBeInTheDocument();
  });

  it('lists usage risers among free agents on the waiver wire, never rostered players', async () => {
    renderApp({ linked, route: '/waivers?tab=risers', nflverse: true });
    const table = await screen.findByRole('table', { name: 'Usage risers' });
    const row = within(table).getByText('Walter Wide').closest('tr')!;
    expect(row).toHaveTextContent('73.3%');
    expect(row).toHaveTextContent('20.0%');
    expect(row).toHaveTextContent('88 snaps in 2 weeks; 4 earlier weeks');
    expect(within(table).queryByText('Walt Wideout')).not.toBeInTheDocument();
  });

  it('shows unmatched player ids in the injury report', async () => {
    renderApp({ linked, route: '/settings', nflverse: true });
    const table = await screen.findByRole('table', { name: 'Unmatched player ids' });
    expect(within(table).getByText('Mystery Man').closest('tr')).toHaveTextContent('no candidate');
    expect(within(table).getByText('Twin One').closest('tr')).toHaveTextContent('ambiguous');
    expect(screen.getByText(/2 nflverse players .* could not be matched.* 812 were matched/)).toBeInTheDocument();
  });
});
