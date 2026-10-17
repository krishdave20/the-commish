import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PREFS_KEY } from '../../app/prefs';
import { renderApp } from '../../app/testUtils';
import type { BracketRow } from '../../data';
import type { Model } from '../../engine';
import { handModel } from '../../engine/test-helpers';
import { createFakeSleeper, sampleAccount, sampleLoadModel } from '../../test/fakes';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const linked = [sampleAccount()];

/** 8 teams, 4 make the playoffs. Team n's quarterback scores 10 + 3n, so Team 8 is the strongest. The records run the OTHER way
    (Team 1 is best, Team 8 is winless) unless `wins` says otherwise, so "if it ended today" and "projected" disagree. */
function bigModel(o: { meRid?: number; wins?: (rid: number) => number } = {}): Model {
  const rids = [1, 2, 3, 4, 5, 6, 7, 8];
  const wins = o.wins ?? ((r: number) => 4 - Math.floor((r - 1) / 2));
  const m = handModel({
    cur: 5, last: 8, slots: ['QB'], playoffTeams: 4, divisions: 0, sd: 20, meRid: o.meRid ?? 8,
    teams: rids.map((r) => ({ rid: r, name: `Team ${r}`, wins: wins(r), losses: 4 - wins(r), pf: 400 - r })),
    players: rids.map((r) => ({ pid: `p${r}`, pos: 'QB' as const, mu: 10 + 3 * r, owner: r, name: `Player ${r}` })),
    games: [
      [5, 1, 2], [5, 3, 4], [5, 5, 6], [5, 7, 8], [6, 1, 3], [6, 2, 4], [6, 5, 7], [6, 6, 8],
      [7, 1, 4], [7, 2, 3], [7, 5, 8], [7, 6, 7], [8, 1, 5], [8, 2, 6], [8, 3, 7], [8, 4, 8],
    ],
  });
  m.meta.leagueId = 'L1';
  return m;
}

const load = (o?: Parameters<typeof bigModel>[0]) => sampleLoadModel(() => bigModel(o));
const round1 = (section: HTMLElement) => [...section.querySelectorAll('.br-match')].filter((e) => /^round 1,/.test(e.getAttribute('aria-label')!)).map((e) => e.getAttribute('aria-label')!);
const ship = () => screen.getByRole('heading', { level: 2, name: 'road to the ’ship' }).closest('section')!;
const bowl = () => screen.getByRole('heading', { level: 2, name: 'the toilet bowl' }).closest('section')!;
const toggle = (name: string) => screen.getByRole('radio', { name });

async function raceReady(o?: { route?: string; sleeper?: ReturnType<typeof createFakeSleeper>; loadModel?: ReturnType<typeof load> }) {
  const r = renderApp({ linked, route: o?.route ?? '/race', loadModel: o?.loadModel ?? load(), sleeper: o?.sleeper });
  await screen.findByRole('heading', { level: 2, name: 'road to the ’ship' });
  await screen.findByRole('group', { name: /round 1, game 1/ });
  return r;
}

describe('the bracket on the playoff picture', () => {
  it('has a section with a plain kicker and a toggle between the ’ship and the toilet bowl', async () => {
    await raceReady();
    const s = ship();
    expect(within(s).getByText('playoff bracket')).toBeInTheDocument();
    expect(within(s).getByRole('button', { name: 'sim it' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'the toilet bowl' })).not.toBeInTheDocument();
    const t = screen.getByRole('radiogroup', { name: 'Which bracket' });
    expect(within(t).getAllByRole('radio').map((r) => r.textContent)).toEqual(['the ’ship', 'the toilet bowl']);
    await userClick(toggle('the toilet bowl'));
    expect(within(bowl()).getByText('consolation bracket: losers advance')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'road to the ’ship' })).not.toBeInTheDocument();
    expect(within(bowl()).getByText(/click the team that gets flushed/)).toBeInTheDocument();
  });

  it('the seeding toggle changes the seeds: today\'s record against the projection', async () => {
    await raceReady();
    const seg = screen.getByRole('radiogroup', { name: 'Bracket seeding' });
    expect(within(seg).getAllByRole('radio').map((r) => r.textContent)).toEqual(['if it ended today', 'projected', 'from the machine']);
    await userClick(within(seg).getByRole('radio', { name: 'if it ended today' }));
    // today: Team 1 is 4-0 and Team 2 is 4-0 (pf breaks it), then Team 3, Team 4
    await waitFor(() => expect(round1(ship())).toEqual([
      'round 1, game 1: Team 1 versus Team 4', 'round 1, game 2: Team 2 versus Team 3',
    ]));
    // projected: four games of strength against a 4-0 head start, so the seeds move but do not flip: not the same pairings as today's table
    await userClick(within(seg).getByRole('radio', { name: 'projected' }));
    await waitFor(() => expect(round1(ship())).not.toEqual(['round 1, game 1: Team 1 versus Team 4', 'round 1, game 2: Team 2 versus Team 3']));
    expect(round1(ship())).toHaveLength(2);
  });

  it('"from the machine" follows the playoff machine\'s picks as they change', async () => {
    const { user } = await raceReady();
    await user.click(within(screen.getByRole('radiogroup', { name: 'Bracket seeding' })).getByRole('radio', { name: 'from the machine' }));
    // no picks: every game goes to the stronger team, so the strongest teams finish on top
    await waitFor(() => expect(round1(ship())[0]).toMatch(/^round 1, game 1: Team \d versus Team \d$/));
    const before = round1(ship());
    // "you win out": Team 8 wins all four of its games
    const machine = screen.getByRole('heading', { level: 2, name: 'playoff machine' }).closest('section')!;
    await user.click(within(machine).getByRole('button', { name: 'pick favorites (all)' }));
    const favs = round1(ship());
    expect(favs).toEqual(before); // picking the favorites changes nothing: that is what the bracket assumed
    // now make the weakest team win everything it plays: pick its side in every one of its games
    await user.click(within(machine).getByRole('button', { name: 'clear' }));
    for (const wk of ['wk 5', 'wk 6', 'wk 7', 'wk 8']) {
      await user.click(within(machine).getByRole('radio', { name: new RegExp(`^${wk}`) }));
      const sides = within(machine).getAllByRole('button').filter((b) => /^Team 1\b/.test(b.querySelector('.nm')?.textContent ?? ''));
      for (const s of sides) await user.click(s);
    }
    await waitFor(() => expect(round1(ship())).not.toEqual(before));
    // Team 1 went 8-0 on the machine: it is seed 1
    expect(round1(ship())[0]).toMatch(/^round 1, game 1: Team 1 versus/);
    // and the picks live on the machine side: clearing them puts the seeds back
    await user.click(within(machine).getByRole('button', { name: 'clear' }));
    await waitFor(() => expect(round1(ship())).toEqual(before));
  });

  it('adds title and flush columns to the standings and a title and flush line to the team drawer', async () => {
    const { user } = await raceReady();
    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent!.replace(/[▲▼]/g, '').trim());
    expect(heads).toContain('title');
    expect(heads).toContain('flush');
    expect(heads.indexOf('flush')).toBe(heads.indexOf('title') + 1);
    await waitFor(() => expect(within(within(table).getByText('Team 8').closest('tr')!).queryAllByText('…')).toHaveLength(0));
    await user.click(within(table).getByText('Team 1'));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('title odds')).toBeInTheDocument();
    expect(drawer).toHaveTextContent(/\d+% to reach the final · \d+% to be crowned toilet bowl champ/);
  });

  it('the toilet bowl: click the team that gets flushed; it advances; the last one standing is crowned', async () => {
    const { user } = await raceReady();
    await user.click(toggle('the toilet bowl'));
    const b = bowl();
    // the four teams that miss the playoffs, worst first: seed 1 is the worst
    expect(round1(b)).toHaveLength(2);
    const flush = within(b).getAllByRole('button', { name: /^flush / });
    expect(flush.length).toBeGreaterThanOrEqual(4);
    await user.click(within(b).getAllByRole('button', { name: /^flush Team \d, seed 1,/ })[0]!);
    expect(within(b).getByText('flushed')).toBeInTheDocument();
    // picking a flush in game 2, then the final
    const second = within(b).getAllByRole('button', { name: /^flush Team \d, seed 2,/ })[0]!;
    await user.click(second);
    const finalists = within(b).getAllByRole('button', { name: /^flush .*round 2/ });
    await user.click(finalists[0]!);
    expect(b.querySelector('.br-champ')).toHaveAttribute('data-state', 'crowned');
    expect(b).toHaveTextContent('toilet bowl champ');
    expect(b).toHaveTextContent('crowned the worst team in the league');
  });
});

async function userClick(el: HTMLElement) {
  const { default: userEvent } = await import('@testing-library/user-event');
  await userEvent.setup().click(el);
}

describe('the front office setting', () => {
  const settings = () => screen.getByRole('heading', { level: 2, name: 'the toilet bowl' }).closest('section')!;
  const stored = () => JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as { losers?: string };
  const LEAGUE_CONSOLATION: BracketRow[] = [
    { m: 1, r: 1, t1: 10, t2: 1, w: null, l: null }, { m: 2, r: 1, t1: 2, t2: 6, w: null, l: null },
    { m: 3, r: 2, t1: null, t2: null, w: null, l: null, p: 1, t1_from: { w: 1 }, t2_from: { w: 2 } },
    { m: 4, r: 2, t1: null, t2: null, w: null, l: null, p: 3, t1_from: { l: 1 }, t2_from: { l: 2 } },
  ];
  const LEAGUE_TOILET = LEAGUE_CONSOLATION.map((r) => (r.p === 1 ? { ...r, t1_from: { l: 1 }, t2_from: { l: 2 } } : r));

  it('defaults to the toilet bowl and persists a change', async () => {
    const { user } = renderApp({ linked, route: '/settings', sleeper: createFakeSleeper({ losersBracket: LEAGUE_CONSOLATION }) });
    await screen.findByRole('heading', { level: 2, name: 'the toilet bowl' });
    const seg = screen.getByRole('radiogroup', { name: 'Losers bracket style' });
    expect(within(seg).getAllByRole('radio').map((r) => r.textContent)).toEqual(['match my league', 'toilet bowl', 'consolation']);
    expect(within(seg).getByRole('radio', { name: 'toilet bowl' })).toBeChecked();
    expect(stored().losers).toBeUndefined(); // nothing saved until you choose
    await user.click(within(seg).getByRole('radio', { name: 'consolation' }));
    expect(stored().losers).toBe('consolation');
    expect(within(seg).getByRole('radio', { name: 'consolation' })).toBeChecked();
    // the choice survives a fresh mount
    cleanup();
    renderApp({ linked, route: '/settings', sleeper: createFakeSleeper({ losersBracket: LEAGUE_CONSOLATION }) });
    await screen.findByRole('heading', { level: 2, name: 'the toilet bowl' });
    expect(within(screen.getByRole('radiogroup', { name: 'Losers bracket style' })).getByRole('radio', { name: 'consolation' })).toBeChecked();
  });

  it('shows the league\'s own setting beside it', async () => {
    renderApp({ linked, route: '/settings', sleeper: createFakeSleeper({ losersBracket: LEAGUE_CONSOLATION }) });
    await screen.findByRole('heading', { level: 2, name: 'the toilet bowl' });
    await waitFor(() => expect(settings()).toHaveTextContent('your league on sleeper: consolation (winners advance)'));
    cleanup();
    renderApp({ linked, route: '/settings', sleeper: createFakeSleeper({ losersBracket: LEAGUE_TOILET }) });
    await screen.findByRole('heading', { level: 2, name: 'the toilet bowl' });
    await waitFor(() => expect(settings()).toHaveTextContent('your league on sleeper: toilet bowl (losers advance)'));
    cleanup();
    renderApp({ linked, route: '/settings' });
    await screen.findByRole('heading', { level: 2, name: 'the toilet bowl' });
    expect(settings()).toHaveTextContent('your league on sleeper: not published yet');
  });

  it('switching it flips who advances and the labels on the playoff picture', async () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ autoRefresh: true, updateUrl: '', losers: 'consolation' }));
    const { user } = await raceReady({ sleeper: createFakeSleeper({ losersBracket: LEAGUE_CONSOLATION }) });
    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent!.replace(/[▲▼]/g, '').trim())).toContain('consolation');
    await user.click(toggle('the consolation prize'));
    const b = screen.getByRole('heading', { level: 2, name: 'the consolation prize' }).closest('section')!;
    expect(within(b).getByText('consolation bracket: winners advance')).toBeInTheDocument();
    // winners advance: the button says advance, not flush; the league agrees, so there is no "official bracket" note
    expect(within(b).getAllByRole('button', { name: /^advance Team/ }).length).toBeGreaterThan(0);
    expect(within(b).queryByRole('button', { name: /^flush / })).not.toBeInTheDocument();
    expect(b).not.toHaveTextContent('official losers bracket');
    await user.click(within(b).getAllByRole('button', { name: /^advance Team \d, seed 1,/ })[0]!);
    expect(within(b).queryByText('flushed')).not.toBeInTheDocument();
  });

  it('says so when the app shows something other than the league\'s own bracket', async () => {
    const { user } = await raceReady({ sleeper: createFakeSleeper({ losersBracket: LEAGUE_CONSOLATION }) });
    await user.click(toggle('the toilet bowl'));
    await waitFor(() => expect(bowl()).toHaveTextContent('your league’s official losers bracket is a consolation bracket'));
  });

  it('"match my league" follows the league: a toilet-bowl league gets the toilet bowl, a consolation league a consolation bracket', async () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ autoRefresh: true, updateUrl: '', losers: 'match' }));
    const a = await raceReady({ sleeper: createFakeSleeper({ losersBracket: LEAGUE_CONSOLATION }) });
    await a.user.click(await screen.findByRole('radio', { name: 'the consolation prize' }));
    expect(screen.getByRole('heading', { level: 2, name: 'the consolation prize' })).toBeInTheDocument();
    cleanup();
    const b = await raceReady({ sleeper: createFakeSleeper({ losersBracket: LEAGUE_TOILET }) });
    await b.user.click(await screen.findByRole('radio', { name: 'the toilet bowl' }));
    expect(screen.getByRole('heading', { level: 2, name: 'the toilet bowl' })).toBeInTheDocument();
    expect(bowl()).not.toHaveTextContent('official losers bracket');
    expect(within(bowl()).getAllByRole('button', { name: /^flush / }).length).toBeGreaterThan(0);
  });
});

describe('the huddle', () => {
  const huddleReady = async (o: { route?: string; sleeper?: ReturnType<typeof createFakeSleeper>; model?: Parameters<typeof bigModel>[0] } = {}) => {
    const r = renderApp({ linked, route: o.route ?? '/', loadModel: load(o.model), sleeper: o.sleeper });
    return r;
  };

  it('in season shows "your path": projected seed, first opponent, title odds, and a link to the full bracket', async () => {
    // Team 1 is 4-0: the playoffs are likelier than the toilet bowl
    await huddleReady({ model: { meRid: 1 } });
    const card = (await screen.findByRole('heading', { level: 2, name: 'your path' })).closest('section')!;
    await waitFor(() => expect(card).toHaveTextContent(/projected seed: \d(st|nd|rd|th)\./));
    expect(card).toHaveTextContent(/first game: round 1, week 9 against Team \d \(seed \d\); \d+% to win\./);
    expect(card).not.toHaveTextContent('toilet bowl');
    expect(card).toHaveTextContent('title odds');
    expect(card).toHaveTextContent(/\d+% to reach the final · \d+% to make the playoffs at all\./);
    expect(within(card).getByRole('link', { name: 'open the full bracket →' })).toHaveAttribute('href', '/race');
  });

  it('a team likelier to land in the toilet bowl than the playoffs gets its toilet bowl path, with a straight face', async () => {
    // Team 1 is the weakest team (and winless): its odds are all about the bottom four
    await huddleReady({ model: { meRid: 1, wins: (r) => (r === 1 ? 0 : 2) } });
    const card = (await screen.findByRole('heading', { level: 2, name: 'your path' })).closest('section')!;
    await waitFor(() => expect(card).toHaveTextContent('the toilet bowl'));
    expect(card).toHaveTextContent(/the odds have you in the toilet bowl \(\d+%\) before the playoffs \(\d+%\)\. someone has to be the worst team in the league\./);
    expect(card).toHaveTextContent(/to be crowned toilet bowl champ: crowned the worst team in the league\./);
    expect(card).toHaveTextContent(/projected seed: \d(st|nd|rd|th)/);
    expect(card).toHaveTextContent(/to lose it and advance/);
  });

  it('the consolation setting gives the same card ordinary copy', async () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ autoRefresh: true, updateUrl: '', losers: 'consolation' }));
    await huddleReady({ model: { meRid: 1, wins: (r) => (r === 1 ? 0 : 2) } });
    const card = (await screen.findByRole('heading', { level: 2, name: 'your path' })).closest('section')!;
    await waitFor(() => expect(card).toHaveTextContent('the consolation prize'));
    expect(card).toHaveTextContent(/there is still a trophy down here/);
    expect(card).not.toHaveTextContent('flush');
  });

  it('postseason preview: both brackets, from Sleeper\'s winners bracket with the real results locked and the rest open', async () => {
    // a 4-team bracket as Sleeper sends it: two round-1 games (the first played) and the final; the p: 3 game is a placement game and is ignored
    const four: BracketRow[] = [
      { m: 1, r: 1, t1: 1, t2: 4, w: 4, l: 1 }, { m: 2, r: 1, t1: 2, t2: 3, w: null, l: null },
      { m: 3, r: 2, t1: 4, t2: null, w: null, l: null, p: 1, t1_from: { w: 1 }, t2_from: { w: 2 } },
      { m: 4, r: 2, t1: 1, t2: null, w: null, l: null, p: 3, t1_from: { l: 1 }, t2_from: { l: 2 } },
    ];
    await huddleReady({ route: '/?phase=postseason', model: { meRid: 8 }, sleeper: createFakeSleeper({ bracket: four, losersBracket: [] }) });
    expect(await screen.findByText('previewing: postseason')).toBeInTheDocument();
    const s = (await screen.findByRole('heading', { level: 2, name: 'road to the ’ship' })).closest('section')!;
    expect(s).toHaveTextContent('from sleeper’s bracket');
    // game 1 was played: Team 4 beat Team 1 and the result is locked
    await waitFor(() => expect(within(s).getByRole('button', { name: /^Team 4, seed 4,.*advances \(final result\)/ })).toHaveAttribute('aria-disabled', 'true'));
    // game 2 is open and pickable; the final gets its teams once game 2 is picked
    await userClick(within(s).getByRole('button', { name: /^advance Team 3,/ }));
    expect(within(s).getAllByRole('button', { name: /^advance Team (3|4),.*round 2/ })).toHaveLength(2);
    // the toilet bowl sits below it
    const t = screen.getByRole('heading', { level: 2, name: 'the toilet bowl' }).closest('section')!;
    expect(within(t).getByText('consolation bracket: losers advance')).toBeInTheDocument();
    expect(within(t).getAllByRole('button', { name: /^flush / }).length).toBeGreaterThan(0);
  });

  it('postseason preview without a Sleeper bracket: the projected one, and the preview note links back to live', async () => {
    await huddleReady({ route: '/?phase=postseason', sleeper: createFakeSleeper() });
    const s = (await screen.findByRole('heading', { level: 2, name: 'road to the ’ship' })).closest('section')!;
    await waitFor(() => expect(s).toHaveTextContent('sleeper has no bracket yet, so this is the projected one'));
    expect(screen.getByRole('heading', { level: 2, name: 'the toilet bowl' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'your path' })).not.toBeInTheDocument();
  });

  it('a failing bracket endpoint falls back to the projected bracket', async () => {
    await huddleReady({ route: '/?phase=postseason', sleeper: createFakeSleeper({ bracketFails: true }) });
    const s = (await screen.findByRole('heading', { level: 2, name: 'road to the ’ship' })).closest('section')!;
    await waitFor(() => expect(s).toHaveTextContent('sleeper has no bracket yet'));
  });
});
