import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../../app/live/liveContext';
import type { LiveValue } from '../../app/live/liveContext';
import { MomentsContext } from '../../app/moments/momentsContext';
import type { MomentsValue } from '../../app/moments/momentsContext';
import { resetNowOverride } from '../../app/moments/nowOverride';
import { buildView } from '../../engine/live';
import type { RawChange } from '../../engine/live';
import { ctx as liveCtx, game, snapshot } from '../../engine/live/test-helpers';
import { model, ctx as momentCtx } from '../../engine/moments/test-helpers';
import type { DraftLiveInfo, Moment, MomentCtx } from '../../engine/moments';
import { LiveActivity } from './LiveActivity';

const H = 3_600_000, MIN = 60_000;
const NOW = new Date(2026, 9, 22, 17, 0, 0).getTime();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetNowOverride();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

/* ---------- hand-made moments ---------- */

const kickoff = (over: Partial<Moment> = {}): Moment => ({
  id: 'game-day', kind: 'game-day', priority: 88, title: 'game day starts tonight at 7:15 pm', detail: '2 of your 6 starters play thursday · your lineup is optimal',
  action: { label: 'check your lineup', to: '/team' }, countdownTo: NOW + H + 42 * MIN + 10_000, label: 'kickoff', precise: true, pages: ['team'], ...over,
});
const waivers = (over: Partial<Moment> = {}): Moment => ({
  id: 'waivers-tonight', kind: 'waivers-tonight', priority: 86, title: 'waivers process tonight at 2:00 am',
  detail: 'your top add is kyler murray (+19.0 lineup lift), bid $76', action: { label: 'open the waiver wire', to: '/waivers' },
  countdownTo: NOW + 3 * H + 12 * MIN, label: 'waivers', pages: ['waivers'], ...over,
});
const live = (bar = 0.8, over: Partial<Moment> = {}): Moment => ({
  id: 'live-matchup', kind: 'live-matchup', priority: 92, live: true, title: 'icemen leads killa k im gay 95.0 to 58.8', detail: '80% to win · 3 of your starters left, 1 of theirs',
  action: { label: 'open game day', to: '/gameday' }, pill: { text: `icemen 95.0 · 58.8 · ${Math.round(bar * 100)}%`, bar }, pages: ['gameday'], ...over,
});
const clock = (title = 'you’re on the clock', over: Partial<Moment> = {}): Moment => ({
  id: 'draft-clock', kind: 'draft-clock', priority: 99, live: true, title, detail: 'your pick is up', action: { label: 'make your pick', to: '/draft?tab=clock' },
  pill: { text: title }, label: 'on the clock', pages: ['draft'], ...over,
});
const recap = (over: Partial<Moment> = {}): Moment => ({
  id: 'final-whistle', kind: 'final-whistle', priority: 91, glance: true, title: 'final: you won 112.3–98.0', detail: 'against killa k im gay · your top scorer: caleb williams (31.2)',
  action: { label: 'see the week', to: '/gameday?week=7' }, pill: { text: 'W 112.3–98.0' }, pages: ['gameday'], ...over,
});

/* ---------- live state: game day's view and feed, built by the engine from hand-made games ---------- */

/** Three of my starters: runner (BBB) and arm (AAA) in a live game, walt (CCC) done. The ball: BBB, 2nd & 7 at aaa 34, in the third. */
function liveView() {
  const sit = { possession: 'BBB', yardLine: 34, territory: 'AAA', down: 2, distance: '7', downText: '2nd & 7', redZone: false, homeTimeouts: 3, awayTimeouts: 2 };
  const games = [
    game({ home: 'AAA', away: 'BBB', state: 'live', quarter: '3', clock: '8:12', elapsed: 0.6, kickoff: 1000, situation: sit }),
    game({ home: 'CCC', away: 'DDD', state: 'final', elapsed: 1, kickoff: 2000 }),
    game({ home: 'EEE', away: 'FFF', state: 'pre', kickoff: 3000 }), game({ home: 'GGG', away: 'HHH', state: 'pre', kickoff: 3000 }),
    game({ home: 'III', away: 'JJJ', state: 'pre', kickoff: 3000 }), game({ home: 'KKK', away: 'LLL', state: 'pre', kickoff: 3000 }),
  ];
  return buildView(liveCtx(), snapshot({ q1: 12.5, r1: 8.2, w1: 21, q2: 15 }, games));
}
const VIEW = liveView();
const WIN = Math.round(VIEW.mine!.winA * 100);

const change = (delta: number, at: number, pid = 'r1', rid = 1): RawChange => ({ id: `${at}-${rid}-${pid}`, at, clock: at, rid, pid, matchupId: 1, delta, total: delta });

function liveValue(changes: RawChange[] = [], view = VIEW): LiveValue {
  return { available: true, loading: false, error: null, view, replay: null, state: { changes } } as unknown as LiveValue;
}

/* ---------- the tree ---------- */

function value(ongoing: Moment[], over: Partial<MomentsValue> = {}): MomentsValue {
  return { ctx: null, moments: ongoing, ongoing, hero: null, now: NOW, previewing: false, ...over };
}
const tree = (v: MomentsValue, l: LiveValue | null = null) => (
  <MemoryRouter>
    <LiveContext.Provider value={l}><MomentsContext.Provider value={v}><LiveActivity /></MomentsContext.Provider></LiveContext.Provider>
  </MemoryRouter>
);

/** a context built around the NOW of these tests, with the Thursday night game first */
function weekCtx(o: Partial<MomentCtx> = {}): MomentCtx {
  const base = momentCtx('2026-10-22T17:00');
  const g = (id: string, home: string, away: string, kickoff: number) => ({ id, home, away, kickoff, state: 'pre' as const });
  return {
    ...base, now: new Date(NOW),
    schedule: {
      games: [g('tnf', 'BUF', 'NYJ', NOW + H + 42 * MIN + 10_000), g('s1', 'DAL', 'PHI', NOW + 3 * 24 * H), g('s2', 'BAL', 'CLE', NOW + 3 * 24 * H), g('s3', 'CHI', 'GB', NOW + 3 * 24 * H)],
      nextGames: [],
    },
    ...o,
  };
}

/** Only the date is fixed, so user events run on real timers; a describe that needs to step time calls `stepTime()`. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
function stepTime() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(NOW);
}
/** How many intervals are running (call after `stepTime`). Other parts of the shell hold timeouts of their own, so only the pill's clock is counted. */
function trackIntervals(): () => number {
  const active = new Set<unknown>();
  const set = globalThis.setInterval, clear = globalThis.clearInterval;
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((...a: Parameters<typeof set>) => { const id = set(...a); active.add(id); return id; }) as typeof set);
  vi.spyOn(globalThis, 'clearInterval').mockImplementation(((id: Parameters<typeof clear>[0]) => { active.delete(id); clear(id); }) as typeof clear);
  return () => active.size;
}

const head = () => document.querySelector('.la-head') as HTMLButtonElement;
const stubMotion = (reduce: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({
  matches: q.includes('no-preference') ? !reduce : q.includes('reduce') ? reduce : false, media: q,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
}));

/* ======================================================================================================================================= */

describe('live activity: compact', () => {
  it('shows nothing when nothing is ongoing', () => {
    const { container } = render(tree(value([])));
    expect(container).toBeEmptyDOMElement();
    expect(document.body.dataset.la).toBeUndefined();
  });

  it('is a button named for what it says: a countdown to waivers, "waivers 3h 12m"', () => {
    render(tree(value([waivers()])));
    const pill = screen.getByRole('button', { name: 'waivers 3h 12m' });
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(pill).toHaveAttribute('aria-controls');
    // the card is folded away: nothing of it is rendered
    expect(screen.queryByText('your top add is kyler murray (+19.0 lineup lift), bid $76')).not.toBeInTheDocument();
    expect(document.querySelector('.la-panel')).not.toBeVisible();
    expect(document.body.dataset.la).toBe('on');
  });

  it('a kickoff countdown shows seconds: "kickoff 1:42:10"', () => {
    render(tree(value([kickoff()])));
    expect(screen.getByRole('button', { name: 'kickoff 1:42:10' })).toBeInTheDocument();
  });

  it('the draft: "on the clock", or "pick in 4"', () => {
    const { rerender } = render(tree(value([clock('you’re on the clock in 4 picks')])));
    expect(screen.getByRole('button', { name: 'pick in 4' })).toBeInTheDocument();
    rerender(tree(value([clock()])));
    expect(screen.getByRole('button', { name: 'on the clock' })).toBeInTheDocument();
  });

  it('the draft countdown before the draft: "draft 3d 4h"', () => {
    render(tree(value([{ id: 'draft-countdown', kind: 'draft-countdown', priority: 70, title: 'the draft starts in 3d 4h', detail: 'saturday at 1:00 pm · you pick 9th of 12', action: { label: 'open the draft room', to: '/draft' }, countdownTo: NOW + 76 * H, label: 'draft', pages: ['draft'] }])));
    expect(screen.getByRole('button', { name: 'draft 3d 4h' })).toBeInTheDocument();
  });

  it('the final whistle: "W 112.3–98.0"', () => {
    render(tree(value([recap()])));
    expect(screen.getByRole('button', { name: 'W 112.3–98.0' })).toBeInTheDocument();
  });

  it('a live matchup with no live state reads the moment’s own pill, with a small win bar', () => {
    render(tree(value([live()])));
    const pill = screen.getByRole('button', { name: 'icemen 95.0 · 58.8 · 80%' });
    expect(pill.querySelector('.la-bar i')).toHaveStyle({ width: '80%' });
  });

  it('a live matchup with live state: my monogram and score on the left, theirs and my win chance on the right, a hairline of minutes played', () => {
    render(tree(value([live()]), liveValue()));
    const pill = screen.getByRole('button', { name: `icemen 41.7 · 15.0 · ${WIN}%` });
    // my monogram (decorative) and the two scores
    expect(pill.querySelector('.avatar')).toHaveTextContent('IC');
    expect(pill.querySelector('.la-n')).toHaveTextContent('41.7');
    expect(pill.querySelector('.la-n-opp')).toHaveTextContent('15.0');
    expect(pill.querySelector('.la-pct')).toHaveTextContent(`${WIN}%`);
    const played = Math.round((1 - (VIEW.mine!.a.remaining + VIEW.mine!.b.remaining) / 2) * 100);
    expect(pill.querySelector('.la-prog i')).toHaveStyle({ width: `${played}%` });
    expect(pill.querySelector('.la-bar')).toBeNull();
  });

  it('the best ongoing moment is the pill; the others are minimal circles', () => {
    render(tree(value([live(), waivers()])));
    expect(screen.getByRole('button', { name: /icemen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^waivers in/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'waivers 3h 12m' })).toHaveClass('la-min');
  });

  it('marks a preview clock so nobody mistakes it for the real thing', () => {
    render(tree(value([waivers()], { previewing: true })));
    expect(screen.getByText('preview')).toBeInTheDocument();
  });

  it('a moment of no known kind keeps the old wording and the moment’s own card', async () => {
    const user = userEvent.setup();
    render(tree(value([{ id: 'trade-deadline', kind: 'trade-deadline', priority: 64, title: 'trade deadline: week 11', detail: 'week 11 starts in 2d 4h', action: { label: 'see handshake deals', to: '/trades' }, countdownTo: NOW + 52 * H, label: 'deadline', pages: ['trades'] }])));
    await user.click(screen.getByRole('button', { name: 'deadline in 2d 4h' }));
    expect(screen.getByText('week 11 starts in 2d 4h')).toBeVisible();
    expect(screen.getByRole('link', { name: 'see handshake deals →' })).toHaveAttribute('href', '/trades');
  });
});

/* ======================================================================================================================================= */

describe('live activity: expanded', () => {
  it('opens on a tap with the title, the countdown and the one action; a second tap folds it', async () => {
    const user = userEvent.setup();
    render(tree(value([waivers()])));
    const pill = head();
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    // the countdown with when it runs, in local time ("tonight at 2:00 am")
    expect(screen.getByText('3h 12m')).toBeVisible();
    expect(screen.getByText(/^to waivers · /)).toBeVisible();
    // no board yet: the moment's own detail stands in for the adds
    expect(screen.getByText('your top add is kyler murray (+19.0 lineup lift), bid $76')).toBeVisible();
    expect(screen.getByRole('link', { name: 'open waiver wire →' })).toHaveAttribute('href', '/waivers');
    // it is a disclosure, not a dialog
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'false');
  });

  it('folds with Escape and puts focus back on the pill', async () => {
    const user = userEvent.setup();
    render(tree(value([waivers()])));
    await user.click(head());
    screen.getByRole('link', { name: /open waiver wire/ }).focus();
    await user.keyboard('{Escape}');
    expect(head()).toHaveAttribute('aria-expanded', 'false');
    expect(head()).toHaveFocus();
  });

  it('folds on a tap outside, but not on a tap inside', async () => {
    const user = userEvent.setup();
    render(<div><button type="button">elsewhere</button>{tree(value([waivers()]))}</div>);
    await user.click(head());
    await user.click(screen.getByText('3h 12m'));
    expect(head()).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(head()).toHaveAttribute('aria-expanded', 'false');
  });

  it('works from the keyboard: Enter opens it, Space folds it, and following the action folds it', async () => {
    const user = userEvent.setup();
    render(tree(value([waivers()])));
    await user.tab();
    expect(head()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(head()).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' ');
    expect(head()).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    await user.tab();
    expect(screen.getByRole('link', { name: /open waiver wire/ })).toHaveFocus();
    await user.click(screen.getByRole('link', { name: /open waiver wire/ }));
    expect(head()).toHaveAttribute('aria-expanded', 'false');
  });

  describe('the live matchup', () => {
    const open = async (changes: RawChange[] = [change(6.4, NOW - 2 * MIN)]) => {
      const user = userEvent.setup();
      render(tree(value([live()]), liveValue(changes)));
      await user.click(head());
      return user;
    };

    it('shows both teams with big scores, projected finals and a win meter, and links to game day', async () => {
      await open();
      const card = document.querySelector('.la-panel') as HTMLElement;
      expect(within(card).getByText('icemen')).toBeVisible();
      expect(within(card).getByText('killa k')).toBeVisible();
      expect(card.querySelectorAll('.la-score')[0]).toHaveTextContent('41.7');
      expect(card.querySelectorAll('.la-score')[1]).toHaveTextContent('15.0');
      expect(within(card).getAllByText(/^projected \d+\.\d$/)).toHaveLength(2);
      expect(within(card).getByRole('img', { name: `${WIN}% to win` })).toBeVisible();
      // each side has its two best starters as an avatar stack (decorative)
      expect(card.querySelectorAll('.avatar-stack')).toHaveLength(2);
      expect(card.querySelectorAll('.avatar-stack')[0]!.querySelectorAll('.avatar')).toHaveLength(2);
      expect(within(card).getByRole('link', { name: 'open game day →' })).toHaveAttribute('href', '/gameday');
    });

    it('says who is on the field, with the down, the spot and the clock', async () => {
      await open();
      const list = screen.getByRole('list', { name: 'your players on the field' });
      const rows = within(list).getAllByRole('listitem');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent('runner · on offense · 2nd & 7 at aaa 34 · q3 8:12');
      expect(rows[0]).toHaveAttribute('data-on', 'true');
      expect(rows[1]).toHaveTextContent('arm · off the field · q3 8:12');
    });

    it('has the last scoring play with how long ago, and the counts', async () => {
      await open();
      expect(screen.getByText(/^\+6\.4/)).toBeVisible();
      expect(document.querySelector('.la-last')).toHaveTextContent('+6.4 · Rex Runner · 2 min ago');
      expect(document.querySelector('.la-sub')).toHaveTextContent(`${WIN}% to win · 0 yet to play · 2 live · 1 done`);
    });

    it('leaves the last play out when the feed has none of mine', async () => {
      await open([change(9, NOW - MIN, 'r2', 2)]);
      expect(document.querySelector('.la-last')).toBeNull();
    });
  });

  it('kickoff: the first kickoff, my starters in that window, anyone flagged or on a bye, and the action', async () => {
    const user = userEvent.setup();
    const c = weekCtx({
      model: model({
        starters: [
          { pid: 'qb', name: 'josh allen', pos: 'QB', nfl: 'BUF', injury: '', played: false },
          { pid: 'rb', name: 'derrick henry', pos: 'RB', nfl: 'BAL', injury: '', played: false },
          { pid: 'wr1', name: 'ceedee lamb', pos: 'WR', nfl: 'DAL', injury: '', played: false },
          { pid: 'qb2', name: 'caleb williams', pos: 'QB', nfl: 'CHI', injury: 'Questionable', played: false },
          { pid: 'wr2', name: 'jaxon smith-njigba', pos: 'WR', nfl: 'SEA', injury: '', played: false },
          { pid: 'def', name: 'bills d/st', pos: 'DEF', nfl: 'BUF', injury: '', played: false },
        ],
      }),
    });
    render(tree(value([kickoff()], { ctx: c })));
    await user.click(head());
    expect(screen.getByText('1:42:10')).toBeVisible();
    expect(screen.getByText('to kickoff · tonight at 6:42 pm')).toBeVisible();
    expect(screen.getByText('nyj at buf')).toBeVisible();
    expect(screen.getByText('2 of your 6 starters play: josh allen, bills d/st')).toBeVisible();
    const flags = screen.getByRole('list', { name: 'starters to check' });
    expect(flags).toHaveTextContent('caleb williams: questionable');
    expect(flags).toHaveTextContent('jaxon smith-njigba: on bye');
    expect(screen.getByRole('link', { name: 'check lineup →' })).toHaveAttribute('href', '/team');
  });

  it('kickoff with nothing known beyond the moment: its title and detail', async () => {
    const user = userEvent.setup();
    render(tree(value([kickoff()])));
    await user.click(head());
    expect(screen.getByText('game day starts tonight at 7:15 pm')).toBeVisible();
    expect(screen.getByText('2 of your 6 starters play thursday · your lineup is optimal')).toBeVisible();
  });

  it('waivers: when they process, my top two adds with lineup lift and bid, FAAB left, and the action', async () => {
    const user = userEvent.setup();
    const top = { pid: '1', name: 'kyler murray', pos: 'QB', gain: 19, bid: 76, dropName: 'bench qb' };
    const second = { pid: '2', name: 'tyjae spears', pos: 'RB', gain: 7.2, bid: 31, dropName: 'bench rb' };
    render(tree(value([waivers()], { ctx: weekCtx({ model: model({ waiver: { top, faab: true, adds: [top, second] }, faabLeft: 1320 }) }) })));
    await user.click(head());
    expect(screen.getByText('to waivers · tonight at 8:12 pm')).toBeVisible();
    const adds = screen.getByRole('list', { name: 'your top adds' });
    const rows = within(adds).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('kyler murray');
    expect(rows[0]).toHaveTextContent('+19.0 lineup lift · bid $76');
    expect(rows[1]).toHaveTextContent('tyjae spears');
    expect(rows[1]).toHaveTextContent('+7.2 lineup lift · bid $31');
    expect(screen.getByText('faab left $1,320')).toBeVisible();
    expect(screen.getByRole('link', { name: 'open waiver wire →' })).toBeVisible();
  });

  it('waivers in a league without FAAB: no bids and no budget', async () => {
    const user = userEvent.setup();
    const top = { pid: '1', name: 'kyler murray', pos: 'QB', gain: 19, bid: 76, dropName: 'bench qb' };
    render(tree(value([waivers()], { ctx: weekCtx({ model: model({ waiver: { top, faab: false }, faabLeft: 1320 }) }) })));
    await user.click(head());
    expect(screen.getByText('+19.0 lineup lift')).toBeVisible();
    expect(screen.queryByText(/faab left/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bid \$/)).not.toBeInTheDocument();
  });

  it('draft: the picks until my turn, the top three by value with tier, my needs and the last pick', async () => {
    const user = userEvent.setup();
    const info: DraftLiveInfo = {
      picksUntil: 4, nextPick: 27,
      best: [
        { pid: '1', name: 'justin jefferson', pos: 'WR', team: 'MIN', tier: 1, vor: 92.4 },
        { pid: '2', name: 'bijan robinson', pos: 'RB', team: 'ATL', tier: 1, vor: 88.1 },
        { pid: '3', name: 'travis kelce', pos: 'TE', team: 'KC', tier: 2, vor: 61 },
      ],
      needs: ['rb', 'rb', 'te'], last: { pickNo: 23, name: 'saquon barkley', pos: 'RB', by: 'killa k im gay' },
    };
    render(tree(value([clock('you’re on the clock in 4 picks')], { draftLive: info })));
    await user.click(head());
    expect(screen.getByText('4 picks until your turn')).toBeVisible();
    expect(screen.getByText(/your pick is #27/)).toBeVisible();
    const best = screen.getByRole('list', { name: 'best available by value' });
    const rows = within(best).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('justin jefferson');
    expect(rows[0]).toHaveTextContent('wr · tier 1');
    expect(rows[0]).toHaveTextContent('vor 92.4');
    expect(screen.getByText('needs: rb ×2, te')).toBeVisible();
    expect(screen.getByText('last pick: #23 saquon barkley (rb) · killa k im gay')).toBeVisible();
    expect(screen.getByRole('link', { name: 'open on the clock →' })).toHaveAttribute('href', '/draft?tab=clock');
  });

  it('draft: on the clock now', async () => {
    const user = userEvent.setup();
    render(tree(value([clock()])));
    await user.click(head());
    expect(document.querySelector('.la-clock')).toHaveTextContent('you’re on the clock');
    expect(screen.getByRole('link', { name: 'open on the clock →' })).toBeVisible();
  });

  it('the final whistle: the result, my top scorer, the odds change, and the action', async () => {
    const user = userEvent.setup();
    const c = weekCtx({
      live: { mine: { name: 'icemen', pts: 112.3, left: [], top: { name: 'caleb williams', pts: 31.2 } }, theirs: { name: 'killa k im gay', pts: 98, left: [] }, winP: 1, started: true, final: true, week: 7 },
      previous: { week: 7, playoffPct: 0.66 }, model: model({ playoffPct: 0.74 }),
    });
    render(tree(value([recap()], { ctx: c })));
    await user.click(head());
    expect(screen.getByText('112.3–98.0')).toBeVisible();
    expect(screen.getByText('you won · week 7')).toBeVisible();
    expect(screen.getByText('against killa k im gay')).toBeVisible();
    expect(document.querySelector('.la-body')).toHaveTextContent('top scorer: caleb williams 31.2');
    expect(screen.getByText('playoff odds 66% → 74%')).toBeVisible();
    expect(screen.getByRole('link', { name: 'see the week →' })).toHaveAttribute('href', '/gameday?week=7');
  });

  it('the final whistle with no odds snapshot leaves the odds line out', async () => {
    const user = userEvent.setup();
    const c = weekCtx({ live: null, model: model({ lastResult: { week: 7, mine: 80, theirs: 90, oppName: 'killa' } }) });
    render(tree(value([recap({ title: 'final: you lost 80.0–90.0', pill: { text: 'L 80.0–90.0' } })], { ctx: c })));
    expect(screen.getByRole('button', { name: 'L 80.0–90.0' })).toBeInTheDocument();
    await user.click(head());
    expect(screen.getByText('you lost · week 7')).toBeVisible();
    expect(screen.queryByText(/playoff odds/)).not.toBeInTheDocument();
  });
});

/* ======================================================================================================================================= */

describe('live activity: several at once', () => {
  const three = () => [live(), kickoff(), waivers()];
  const compactNow = () => head().textContent ?? '';

  it('shows the top one as the pill and the others as minimal circles beside it, each named by what it says', () => {
    render(tree(value(three())));
    expect(head()).toHaveTextContent('icemen');
    const circles = document.querySelectorAll('.la-min');
    expect(circles).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'kickoff 1:42:10' })).toHaveClass('la-min');
    expect(screen.getByRole('button', { name: 'waivers 3h 12m' })).toHaveClass('la-min');
    // a circle is an icon, not words
    expect(screen.getByRole('button', { name: 'kickoff 1:42:10' }).querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'kickoff 1:42:10' })).toHaveTextContent('');
  });

  it('a tap on a circle switches the pill to that activity and the old one becomes a circle', async () => {
    const user = userEvent.setup();
    render(tree(value(three())));
    await user.click(screen.getByRole('button', { name: 'waivers 3h 12m' }));
    expect(head()).toHaveTextContent('waivers 3h 12m');
    expect(head()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /icemen/ })).toHaveClass('la-min');
    // the best one coming back is a change of lead, so it takes the pill again only when the viewer picks it
    await user.click(screen.getByRole('button', { name: /icemen/ }));
    expect(head()).toHaveTextContent('icemen');
  });

  it('a viewer’s pick is dropped when a different activity becomes the best', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(value(three())));
    await user.click(screen.getByRole('button', { name: 'waivers 3h 12m' }));
    expect(head()).toHaveTextContent('waivers');
    rerender(tree(value([clock('you’re on the clock in 2 picks'), ...three()])));
    expect(head()).toHaveTextContent('pick in 2');
  });

  it('open, the arrows move between the activities, with page dots that follow', async () => {
    const user = userEvent.setup();
    render(tree(value(three())));
    await user.click(head());
    const dots = () => [...document.querySelectorAll('.la-dots i')].map((d) => d.getAttribute('data-on') === 'true');
    expect(dots()).toEqual([true, false, false]);
    expect(screen.getByText('activity 1 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'next activity' }));
    expect(dots()).toEqual([false, true, false]);
    expect(head()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'check lineup →' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'next activity' }));
    expect(screen.getByRole('link', { name: 'open waiver wire →' })).toBeVisible();
    // it wraps
    await user.click(screen.getByRole('button', { name: 'next activity' }));
    expect(screen.getByRole('link', { name: 'open game day →' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'previous activity' }));
    expect(screen.getByRole('link', { name: 'open waiver wire →' })).toBeVisible();
  });

  it('has no pager when there is only one activity', async () => {
    const user = userEvent.setup();
    render(tree(value([waivers()])));
    await user.click(head());
    expect(document.querySelector('.la-pager')).toBeNull();
    expect(screen.queryByRole('button', { name: 'next activity' })).not.toBeInTheDocument();
  });

  it('a swipe left or right on the open card goes to the next or previous activity', () => {
    render(tree(value(three())));
    fireEvent.click(head());
    const card = document.querySelector('.la-card') as HTMLElement;
    const swipe = (dx: number, dy = 0) => {
      fireEvent.pointerDown(card, { clientX: 200, clientY: 100, pointerId: 1, pointerType: 'touch', button: 0 });
      fireEvent.pointerUp(window, { clientX: 200 + dx, clientY: 100 + dy, pointerId: 1, pointerType: 'touch' });
    };
    swipe(-90);
    expect(screen.getByRole('link', { name: 'check lineup →' })).toBeVisible();
    swipe(-90);
    expect(screen.getByRole('link', { name: 'open waiver wire →' })).toBeVisible();
    swipe(90);
    expect(screen.getByRole('link', { name: 'check lineup →' })).toBeVisible();
    // too short, or mostly sideways-down: nothing
    swipe(-20);
    swipe(-60, 70);
    expect(screen.getByRole('link', { name: 'check lineup →' })).toBeVisible();
    expect(head()).toHaveAttribute('aria-expanded', 'true');
  });

  it('a swipe up folds the open card', () => {
    render(tree(value(three())));
    fireEvent.click(head());
    const card = document.querySelector('.la-card') as HTMLElement;
    fireEvent.pointerDown(card, { clientX: 200, clientY: 200, pointerId: 1, pointerType: 'touch', button: 0 });
    fireEvent.pointerUp(window, { clientX: 205, clientY: 120, pointerId: 1, pointerType: 'touch' });
    expect(head()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keyboard: the arrow keys switch activities, Enter opens, Escape folds', async () => {
    const user = userEvent.setup();
    render(tree(value(three())));
    await user.tab();
    expect(head()).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(compactNow()).toContain('kickoff 1:42:10');
    await user.keyboard('{ArrowRight}');
    expect(compactNow()).toContain('waivers 3h 12m');
    await user.keyboard('{ArrowLeft}');
    expect(compactNow()).toContain('kickoff 1:42:10');
    expect(head()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(head()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'check lineup →' })).toBeVisible();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('link', { name: 'open waiver wire →' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(head()).toHaveAttribute('aria-expanded', 'false');
    expect(head()).toHaveFocus();
  });

  it('arrow keys do nothing with one activity', async () => {
    const user = userEvent.setup();
    render(tree(value([waivers()])));
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(head()).toHaveTextContent('waivers 3h 12m');
  });

  it('shows at most three circles and counts the rest', () => {
    const more = [clock('you’re on the clock in 9 picks'), live(), kickoff(), waivers(), recap(), { ...waivers(), id: 'trade', kind: 'trade-deadline' as const, priority: 40, label: 'deadline', title: 'trade deadline' }];
    render(tree(value(more)));
    expect(document.querySelectorAll('.la-min')).toHaveLength(3);
    expect(document.querySelector('.la-more')).toHaveTextContent('+2');
  });
});

/* ======================================================================================================================================= */

describe('live activity: a big moment', () => {
  beforeEach(stepTime);

  const flash = () => document.querySelector('.la-flash');

  it('widens the pill with "+6.4 · runner" when my score jumps six points or more, then settles', () => {
    const { rerender } = render(tree(value([live()]), liveValue()));
    expect(flash()).toBeNull();
    rerender(tree(value([live()]), liveValue([change(6.4, Date.now() + 30_000)])));
    expect(flash()).toHaveTextContent('+6.4 · runner');
    expect(head()).toHaveAccessibleName(expect.stringContaining('+6.4 · runner'));
    act(() => { vi.advanceTimersByTime(4000); });
    expect(flash()).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(flash()).toBeNull();
  });

  it('says nothing for a jump under six, for the other side’s, or for plays that were in the feed before it opened', () => {
    const history = [change(9, 500)];
    const { rerender } = render(tree(value([live()]), liveValue(history)));
    expect(flash()).toBeNull();
    rerender(tree(value([live()]), liveValue([change(5.9, 2000), ...history])));
    expect(flash()).toBeNull();
    rerender(tree(value([live()]), liveValue([change(12, 3000, 'r2', 2), change(5.9, 2000), ...history])));
    expect(flash()).toBeNull();
  });

  it('a touchdown and the points after are one jump', () => {
    const { rerender } = render(tree(value([live()]), liveValue()));
    rerender(tree(value([live()]), liveValue([change(1, 5000, 'q1'), change(6, 5000, 'r1')])));
    expect(flash()).toHaveTextContent('+7.0 · runner +1');
  });

  it('does not claim what kind of play it was', () => {
    const { rerender } = render(tree(value([live()]), liveValue()));
    rerender(tree(value([live()]), liveValue([change(6.4, 9000)])));
    expect(flash()!.textContent).not.toMatch(/td|touchdown/i);
  });

  it('with reduced motion there is no width animation, just the text', () => {
    stubMotion(true);
    const { rerender } = render(tree(value([live()]), liveValue()));
    rerender(tree(value([live()]), liveValue([change(6.4, 9000)])));
    expect(document.querySelector('.la')).toHaveAttribute('data-motion', 'reduced');
    expect(flash()).toHaveTextContent('+6.4 · runner');
  });

  it('is announced politely', () => {
    const { rerender } = render(tree(value([live()]), liveValue()));
    rerender(tree(value([live()]), liveValue([change(6.4, 9000)])));
    expect(document.querySelector('[role="status"]')).toHaveTextContent('your score jumped +6.4 · runner');
  });

  it('a circle for the live matchup glows instead of widening', () => {
    const { rerender } = render(tree(value([clock('you’re on the clock in 6 picks'), live()]), liveValue()));
    rerender(tree(value([clock('you’re on the clock in 6 picks'), live()]), liveValue([change(6.4, 9000)])));
    expect(flash()).toBeNull();
    expect(document.querySelector('.la-min[data-kind="matchup"]')).toHaveAttribute('data-flash', 'true');
  });
});

/* ======================================================================================================================================= */

describe('live activity: the clock', () => {
  beforeEach(stepTime);

  it('counts down each second', () => {
    render(tree(value([kickoff()])));
    expect(screen.getByRole('button', { name: 'kickoff 1:42:10' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('button', { name: 'kickoff 1:42:09' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(59_000); });
    expect(screen.getByRole('button', { name: 'kickoff 1:41:10' })).toBeInTheDocument();
  });

  it('a minutes countdown keeps its units (waivers 3h 12m, then 3h 11m)', () => {
    render(tree(value([waivers()])));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole('button', { name: 'waivers 3h 11m' })).toBeInTheDocument();
  });

  it('turns urgent in the last five minutes and says “now” at zero', () => {
    render(tree(value([kickoff({ countdownTo: NOW + 5 * MIN + 2000 })])));
    const root = document.querySelector('.la')!;
    expect(root).toHaveAttribute('data-urgency', 'soon');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(root).toHaveAttribute('data-urgency', 'urgent');
    act(() => { vi.advanceTimersByTime(5 * MIN); });
    expect(screen.getByRole('button', { name: 'kickoff now' })).toBeInTheDocument();
  });

  it('stops ticking while the page is hidden, and catches up when it is back', () => {
    const running = trackIntervals();
    render(tree(value([kickoff()])));
    expect(running()).toBe(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(running()).toBe(0);
    act(() => { vi.advanceTimersByTime(30_000); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(running()).toBe(1);
    expect(screen.getByRole('button', { name: 'kickoff 1:41:40' })).toBeInTheDocument();
  });

  it('stops its timer when it goes away', () => {
    const running = trackIntervals();
    const { unmount } = render(tree(value([kickoff()])));
    expect(running()).toBe(1);
    unmount();
    expect(running()).toBe(0);
  });

  it('nothing ticks for a pill that has no clock to show; opening the card starts a slow tick for “2 min ago”', () => {
    const running = trackIntervals();
    render(tree(value([live()]), liveValue()));
    expect(running()).toBe(0);
    fireEvent.click(head());
    expect(running()).toBe(1);
    fireEvent.click(head());
    expect(running()).toBe(0);
  });

  it('the open card counts too', async () => {
    render(tree(value([kickoff()])));
    fireEvent.click(head());
    expect(screen.getByText('1:42:10')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('1:42:08')).toBeInTheDocument();
  });
});

describe('live activity: motion', () => {
  beforeEach(stepTime);

  it('animates when the viewer has no preference', () => {
    stubMotion(false);
    render(tree(value([kickoff()])));
    expect(document.querySelector('.la')).toHaveAttribute('data-motion', 'ok');
  });

  it('with reduced motion nothing animates, and the countdown still updates', () => {
    stubMotion(true);
    render(tree(value([kickoff()])));
    expect(document.querySelector('.la')).toHaveAttribute('data-motion', 'reduced');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('button', { name: 'kickoff 1:42:08' })).toBeInTheDocument();
  });
});

/* ======================================================================================================================================= */

describe('live activity: hiding', () => {
  it('hides on the × and stays hidden for that moment', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(value([waivers()])));
    await user.click(screen.getByRole('button', { name: 'dismiss waivers' }));
    expect(screen.queryByRole('button', { name: /^waivers/ })).not.toBeInTheDocument();
    expect(document.body.dataset.la).toBeUndefined();
    // the same moment, a minute later: still gone
    rerender(tree(value([waivers({ countdownTo: NOW + 3 * H })])));
    expect(screen.queryByRole('button', { name: /^waivers/ })).not.toBeInTheDocument();
  });

  it('comes back for the next moment', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(value([waivers()])));
    await user.click(screen.getByRole('button', { name: 'dismiss waivers' }));
    rerender(tree(value([live()])));
    expect(screen.getByRole('button', { name: /icemen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dismiss live activity' })).toBeInTheDocument();
  });

  it('comes back when its state changes: the countdown turning urgent, the lead changing hands', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(value([waivers()])));
    await user.click(screen.getByRole('button', { name: 'dismiss waivers' }));
    rerender(tree(value([waivers({ countdownTo: NOW + 4 * MIN })])));
    expect(screen.getByRole('button', { name: 'waivers 4m' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'dismiss waivers' }));
    expect(screen.queryByRole('button', { name: /^waivers/ })).not.toBeInTheDocument();

    const second = render(tree(value([live(0.8)])));
    await user.click(screen.getAllByRole('button', { name: 'dismiss live activity' })[0]!);
    second.rerender(tree(value([live(0.7, { pill: { text: 'icemen 96.0 · 58.8 · 70%', bar: 0.7 } })])));
    expect(screen.queryAllByRole('button', { name: /icemen/ })).toHaveLength(0);
    second.rerender(tree(value([live(0.4, { pill: { text: 'icemen 96.0 · 100.8 · 40%', bar: 0.4 } })])));
    expect(screen.getByRole('button', { name: /icemen 96\.0/ })).toBeInTheDocument();
  });

  it('a hidden activity leaves the others in place, and forgets it once it is gone (next week’s waivers show again)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(value([live(), waivers()])));
    // hide the live one: the pill is the next activity
    await user.click(screen.getByRole('button', { name: 'dismiss live activity' }));
    expect(head()).toHaveTextContent('waivers 3h 12m');
    expect(document.querySelectorAll('.la-min')).toHaveLength(0);
    // the waivers activity goes (the run happened) and comes back a week later: it was not the one hidden, so it shows
    rerender(tree(value([])));
    rerender(tree(value([waivers()])));
    expect(head()).toHaveTextContent('waivers');
    await user.click(screen.getByRole('button', { name: 'dismiss waivers' }));
    rerender(tree(value([])));
    rerender(tree(value([waivers()])));
    expect(head()).toHaveTextContent('waivers');
  });

  it('a new moment starts folded even if the last one was open', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(value([waivers()])));
    await user.click(head());
    rerender(tree(value([live()])));
    expect(screen.getByRole('button', { name: /icemen/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('a long press on the pill hides it until its state changes, and does not open it', () => {
    stepTime();
    const { rerender } = render(tree(value([waivers()])));
    const pill = head();
    fireEvent.pointerDown(pill, { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(400); });
    expect(head()).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch' });
    expect(document.querySelector('.la-head')).toBeNull();
    expect(document.body.dataset.la).toBeUndefined();
    rerender(tree(value([waivers({ countdownTo: NOW + 2 * H })])));
    expect(document.querySelector('.la-head')).toBeNull();
    rerender(tree(value([waivers({ countdownTo: NOW + 3 * MIN })])));
    expect(head()).toHaveTextContent('waivers 3m');
  });

  it('a short press is a tap, and moving the finger cancels the long press', () => {
    stepTime();
    render(tree(value([waivers()])));
    fireEvent.pointerDown(head(), { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerUp(head(), { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch' });
    fireEvent.click(head());
    expect(head()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(head());
    fireEvent.pointerDown(head(), { clientX: 10, clientY: 10, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(head(), { clientX: 40, clientY: 12, pointerId: 2, pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(800); });
    expect(head()).toBeInTheDocument();
  });
});

/* ======================================================================================================================================= */

describe('live activity: recap after the final whistle', () => {
  it('shows for the matchup that just ended, and gives way to the live score when a new one starts', () => {
    const { rerender } = render(tree(value([live()]), liveValue()));
    expect(head()).toHaveTextContent('icemen');
    rerender(tree(value([recap()])));
    expect(screen.getByRole('button', { name: 'W 112.3–98.0' })).toBeInTheDocument();
    expect(document.querySelector('.la')).toHaveAttribute('data-kind', 'recap');
  });

  it('the recap outranks a countdown that is still hours off (the engine gives it 91)', () => {
    render(tree(value([recap(), waivers()])));
    expect(head()).toHaveTextContent('W 112.3–98.0');
    expect(screen.getByRole('button', { name: 'waivers 3h 12m' })).toHaveClass('la-min');
  });
});

/* ======================================================================================================================================= */

describe('live activity: announcements', () => {
  beforeEach(stepTime);

  const status = () => document.querySelector('[role="status"]')!;

  it('a countdown is silent', () => {
    render(tree(value([waivers()])));
    expect(status()).toHaveTextContent('');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(status()).toHaveTextContent('');
  });

  it('announces when the draft clock reaches you, once', () => {
    const { rerender } = render(tree(value([clock('you’re on the clock in 1 pick')])));
    expect(status()).toHaveTextContent('');
    rerender(tree(value([clock()])));
    expect(status()).toHaveTextContent('you’re on the clock');
    expect(status()).toHaveAttribute('aria-live', 'polite');
  });

  it('announces a lead change in the live matchup, but not each score update', () => {
    const { rerender } = render(tree(value([live(0.8)])));
    rerender(tree(value([live(0.7, { pill: { text: 'icemen 96.0 · 58.8 · 70%', bar: 0.7 } })])));
    expect(status()).toHaveTextContent('');
    rerender(tree(value([live(0.4, { title: 'icemen trails killa k im gay 96.0 to 100.8', pill: { text: 'icemen 96.0 · 100.8 · 40%', bar: 0.4 } })])));
    expect(status()).toHaveTextContent('icemen trails killa k im gay 96.0 to 100.8. icemen 96.0 · 100.8 · 40%');
  });

  it('announces the final whistle when it arrives while the page is open, but not when it was there from the start', () => {
    const first = render(tree(value([recap()])));
    expect(status()).toHaveTextContent('');
    first.unmount();
    const { rerender } = render(tree(value([live()])));
    rerender(tree(value([recap()])));
    expect(status()).toHaveTextContent('final: you won 112.3–98.0');
  });

  it('a minimal circle’s news is spoken too (the clock reaching you while the pill shows the matchup)', () => {
    const { rerender } = render(tree(value([live(), clock('you’re on the clock in 1 pick')])));
    rerender(tree(value([live(), clock()])));
    expect(status()).toHaveTextContent('you’re on the clock');
  });
});
