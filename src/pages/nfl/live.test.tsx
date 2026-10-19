import { readFileSync } from 'node:fs';
import { cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeSleeper, liveSampleModel, nflScoreGame, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, samplePlayersFile,
} from '../../test/fakes';
import type { PlayersMap, ScoreGame } from '../../data';
import { renderApp } from '../../app/testUtils';
import { clockParts, redZoneLine, redZoneSpoken, redZoneTeam, scoreKind, sortLive } from './liveLogic';
import { parseGameRows } from '../../engine/nfl';
import { resetLiveMemory } from './useLiveChanges';

// the whole app mounts for each test; with the full suite running in parallel the first render can take longer than the 5 s default
configure({ asyncUtilTimeout: 12_000 });
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});
beforeEach(() => resetLiveMemory());

const linked = [sampleAccount()];
const D = 86_400_000;

interface Ball { poss: string; terr: string; yard: number; down?: string; used?: [number, number] }
interface Spec { id: string; away: string; home: string; score: [number, number]; ball?: Ball | null; clock?: [string, string]; state?: 'live' | 'pre' | 'final' }

/** a game of the scores feed with the ball somewhere: the quarters add up to the score */
const split = (n: number) => [n - Math.floor(n / 2), Math.floor(n / 2)];
function game(s: Spec, kickoff: number): ScoreGame {
  const base = nflScoreGame({ id: s.id, away: s.away, home: s.home, state: s.state ?? 'live', kickoff, q: [split(s.score[0]), split(s.score[1])], clock: s.clock, channel: 'CBS' });
  if (!s.ball) return base;
  const b = s.ball;
  return {
    ...base,
    metadata: {
      ...base.metadata, possession: b.poss, yard_line: b.yard, yard_line_territory: b.terr, down: Number(b.down?.[0] ?? 1), down_and_distance: b.down ?? '1st & 10',
      red_zone: '', away_used_timeouts: b.used?.[0] ?? 1, home_used_timeouts: b.used?.[1] ?? 3,
    },
  };
}

const rec = (id: string, first: string, last: string, position: string, team: string) => ({ player_id: id, first_name: first, last_name: last, position, team, status: 'Active', active: true });
const playersFile = (): PlayersMap => ({ ...samplePlayersFile(), qbN1: rec('qbN1', 'Bo', 'Leader', 'QB', 'N1') } as unknown as PlayersMap);

/** the three games: N1 (home) leads N2 by 7 with the ball at the N2 44 (3 of my starters play for N1); N3 and N4 are one point apart. */
const DEFAULT: Spec[] = [
  { id: 'g1', away: 'N2', home: 'N1', score: [10, 17], ball: { poss: 'N1', terr: 'N2', yard: 44, down: '2nd & 7', used: [1, 3] } },
  { id: 'g2', away: 'N4', home: 'N3', score: [20, 21], ball: { poss: 'N4', terr: 'N4', yard: 25, down: '1st & 10' } },
  { id: 'g3', away: 'N5', home: 'N6', score: [14, 35], ball: { poss: 'N5', terr: 'N5', yard: 30, down: '3rd & 4' } },
];

function setup(o: { route?: string; specs?: Spec[]; pre?: boolean } = {}) {
  const kickoff = Date.now() - 3_600_000;
  const world = { specs: o.specs ?? DEFAULT };
  const sleeper = createFakeSleeper({
    live: {
      matchups: () => sampleLiveMatchups({ t1qb: 10, t1rb: 5, t1wr: 6, t2qb: 4, t3qb: 5, t4qb: 9 }),
      scores: (w) => (w === 5
        ? [
          ...world.specs.map((s) => game(s, kickoff)),
          ...(o.pre === false ? [] : [nflScoreGame({ id: 'gp', away: 'BUF', home: 'MIA', state: 'pre', kickoff: Date.now() + 3 * D })]),
        ]
        : []),
      projections: () => sampleLiveProjections(),
      stats: () => ({}),
    },
    playersFile: playersFile(),
  });
  const utils = renderApp({ linked, route: o.route ?? '/nfl', sleeper, loadModel: sampleLoadModel(liveSampleModel) });
  const poll = async () => { await utils.user.click(screen.getByRole('button', { name: 'Refresh' })); };
  return { world, kickoff, poll, ...utils };
}

const open = (name: RegExp) => screen.findByRole('button', { name });
const cardOf = async (away: string, home: string) => (await open(new RegExp(`open game details, ${away} at ${home}`))).closest('article')!;
const order = () => screen.getAllByRole('button', { name: /open game details, / }).map((b) => b.getAttribute('aria-label')!.replace('open game details, ', ''));
const tabRadio = (name: RegExp) => screen.findByRole('radio', { name });

describe('the live tab: when it shows', () => {
  it('is the default tab while games are on, and the tab says how many: "live · 3"', async () => {
    setup();
    const live = await tabRadio(/^live · 3$/);
    await waitFor(() => expect(live).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('radio', { name: 'scoreboard' })).toHaveAttribute('aria-checked', 'false');
    expect(await cardOf('N2', 'N1')).toBeInTheDocument();
    // the tab strip carries the calm dot while a game is on
    expect(live.closest('.nf-tabs')).toHaveAttribute('data-live', 'true');
  });

  it('is the first tab, but the scoreboard stays the default when nothing is live', async () => {
    setup({ specs: [{ id: 'g1', away: 'N2', home: 'N1', score: [10, 17], state: 'final' }] });
    const radios = within(await screen.findByRole('radiogroup', { name: 'nfl view' })).getAllByRole('radio');
    expect(radios.map((r) => r.textContent).slice(0, 2)).toEqual(['live', 'scoreboard']);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'scoreboard' })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('radio', { name: 'live' })).toHaveAttribute('aria-checked', 'false');
    expect(radios[0]!.closest('.nf-tabs')).not.toHaveAttribute('data-live');
  });

  it('says "no games live right now" with the next kickoff, a countdown and a link to the scoreboard', async () => {
    const { user } = setup({ route: '/nfl?tab=live', specs: [{ id: 'g1', away: 'N2', home: 'N1', score: [10, 17], state: 'final' }] });
    expect(await screen.findByRole('heading', { name: 'no games live right now' })).toBeInTheDocument();
    const next = await screen.findByText(/next kickoff:/);
    expect(next).toHaveTextContent('BUF at MIA'.replace('BUF', 'Buffalo').replace('MIA', 'Miami'));
    expect(next).toHaveTextContent(/in 2d 2\dh \d+m|in 3d 0h \d+m/);
    await user.click(screen.getByRole('link', { name: 'see the scoreboard' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'scoreboard' })).toHaveAttribute('aria-checked', 'true'));
    expect(await screen.findByRole('group', { name: 'week 5 at a glance' })).toBeInTheDocument();
  });
});

describe('the live cards', () => {
  it('shows the teams, big scores with the leader emphasised, records, the quarter and clock, the ball, the down and the spot', async () => {
    setup();
    const c = await cardOf('N2', 'N1');
    expect(c).toHaveTextContent('q2 7:30');
    expect(c).toHaveTextContent('CBS');
    expect(c).toHaveTextContent('2-3'); // away record
    expect(c).toHaveTextContent('3-2'); // home record
    const [away, home] = Array.from(c.querySelectorAll('.nf-lv-team'));
    expect(away).toHaveTextContent('N2');
    expect(away!.querySelector('.nf-lv-score')).toHaveTextContent('10');
    expect(home!.querySelector('.nf-lv-score')).toHaveTextContent('17');
    expect(home).toHaveAttribute('data-lead', 'true');
    expect(away).not.toHaveAttribute('data-lead');
    // the ball sits next to the team that has it
    expect(home!.querySelector('.nf-lv-ball')).not.toBeNull();
    expect(away!.querySelector('.nf-lv-ball')).toBeNull();
    expect(within(c).getByText('n1 ball · 2nd & 7 at the n2 44')).toBeInTheDocument();
    expect(c.querySelector('.rzb')).toBeNull();
    // timeouts: N2 has used 1 of 3, N1 all 3
    expect(away!.querySelectorAll('.fs-dots i[data-on="true"]')).toHaveLength(2);
    expect(home!.querySelectorAll('.fs-dots i[data-on="true"]')).toHaveLength(0);
    expect(c).toHaveTextContent('n2 2 timeouts left');
  });

  it('draws the mini field full width with the ball at the spot and the arrow, and a compact line score', async () => {
    setup();
    const c = await cardOf('N2', 'N1');
    const field = c.querySelector('.mf')!;
    expect(field.closest('.nf-lv-field')).not.toBeNull();
    expect(field).toHaveAttribute('data-dir', 'left'); // N1 is at home: it goes left
    expect(field.querySelector('.mf-ball')).toHaveStyle({ left: `${(54 / 120) * 100}%` });
    expect(field.querySelector('.mf-arrow')).not.toBeNull();
    // the table of points by quarter: 10 = 5+5 and 17 = 9+8 add up
    const q = within(c).getByRole('table', { name: /points by quarter/ });
    expect(within(q).getByRole('row', { name: /n2 5 5 10/ })).toBeInTheDocument();
    expect(within(q).getByRole('row', { name: /n1 9 8 17/ })).toBeInTheDocument();
  });

  it('opens the existing game drawer on a tap', async () => {
    const { user } = setup();
    await user.click(await open(/open game details, N2 at N1/));
    expect(await screen.findByRole('dialog', { name: /N2 at N1/i })).toBeInTheDocument();
  });

  it('shows your starters in the game with their live points and how many players your league has in it, and "nfl only" hides both', async () => {
    const { user } = setup();
    const c = await cardOf('N2', 'N1');
    const starters = within(c).getByRole('list', { name: 'your starters in this game' });
    expect(within(starters).getByText('Alex Arm').closest('li')).toHaveTextContent('10.0');
    expect(starters.querySelectorAll('li .avatar')).toHaveLength(3);
    expect(c).toHaveTextContent(/\d+ players rostered in your league/);
    expect((await cardOf('N4', 'N3'))).toHaveTextContent('none of your starters are in this game');
    await user.click(screen.getByRole('button', { name: 'nfl only' }));
    const after = await cardOf('N2', 'N1');
    expect(within(after).queryByRole('list', { name: 'your starters in this game' })).toBeNull();
    expect(after).not.toHaveTextContent('rostered in your league');
    expect(screen.queryByRole('radiogroup', { name: 'sort live games' })).toBeNull();
    // the scores and the situation stay
    expect(after).toHaveTextContent('n1 ball');
  });
});

describe('sorting', () => {
  it('puts the closest score first, or the games with most of your starters first', async () => {
    const { user } = setup();
    await cardOf('N2', 'N1');
    expect(order()).toEqual(['N4 at N3', 'N2 at N1', 'N5 at N6']);
    await user.click(screen.getByRole('radio', { name: 'most fantasy relevant' }));
    // N1 has three of my starters; then the game with more rostered players; the unrelated game is last
    expect(order()).toEqual(['N2 at N1', 'N4 at N3', 'N5 at N6']);
    await user.click(screen.getByRole('radio', { name: 'closest' }));
    expect(order()).toEqual(['N4 at N3', 'N2 at N1', 'N5 at N6']);
  });

  it('is a pure rule: margin first, then the game further along; relevance falls back to closeness', () => {
    const rows = parseGameRows(DEFAULT.map((s) => game(s, 1)), 5);
    const fx = new Map(rows.map((g) => [g.id, { starters: [], rostered: g.id === 'g3' ? 9 : 0 }]));
    expect(sortLive(rows, 'closest', fx).map((g) => g.id)).toEqual(['g2', 'g1', 'g3']);
    expect(sortLive(rows, 'relevant', fx).map((g) => g.id)).toEqual(['g3', 'g2', 'g1']);
  });
});

describe('the change highlight', () => {
  it('flashes a +7 chip on the team that scored between two polls, and the chip goes away by itself', async () => {
    const { world, poll } = setup();
    const c = await cardOf('N2', 'N1');
    expect(c.querySelector('.nf-lv-chip')).toBeNull();
    world.specs = [{ ...DEFAULT[0]!, score: [10, 24] }, DEFAULT[1]!, DEFAULT[2]!];
    await poll();
    const home = await waitFor(() => {
      const t = Array.from(c.ownerDocument.querySelectorAll('article')).find((a) => a.textContent?.includes('N1') && a.textContent?.includes('24'))!;
      expect(t).toBeTruthy();
      return t.querySelector('.nf-lv-team[data-side="home"]')!;
    });
    expect(home.querySelector('.nf-lv-chip')).toHaveTextContent('+7');
    expect(home.querySelector('.nf-lv-score')).toHaveAttribute('data-flash', 'true');
    // the other team and the other games show none
    expect(document.querySelectorAll('.nf-lv-chip')).toHaveLength(1);
    expect(document.querySelector('.nf-lv-team[data-side="away"] .nf-lv-chip')).toBeNull();
    // announced to a screen reader
    expect(screen.getByText(/scored 7: n2 10, n1 24/)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll('.nf-lv-chip')).toHaveLength(0), { timeout: 4500 });
  }, 12_000);

  it('gives the chip no animation when reduced motion is asked for: the animation lives only inside the no-preference query', () => {
    const css = readFileSync(`${process.cwd()}/src/styles/nfl.css`, 'utf8');
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    const motion = blocks.join('\n');
    const outside = blocks.reduce((rest, b) => rest.replace(b, ''), css);
    for (const name of ['nf-chip-in', 'nf-score-flash', 'nf-lv-pulse', 'rzb-wipe']) {
      expect(motion).toContain(`animation: ${name}`);
      expect(outside).not.toMatch(new RegExp(`animation: ${name}`));
    }
  });
});

describe('the red zone', () => {
  const inside = (ball: Ball, away = 'N4', home = 'N3'): Spec[] => [DEFAULT[0]!, { id: 'g2', away, home, score: [20, 21], ball }, DEFAULT[2]!];

  it('shows the badge only inside the 20, for either team and either side of the field, with the words a viewer expects', async () => {
    setup({
      specs: [
        // away team attacks the home goal line: the ball is on the home (N3) 8
        { id: 'g2', away: 'N4', home: 'N3', score: [20, 21], ball: { poss: 'N4', terr: 'N3', yard: 8, down: '1st & Goal' } },
        // home team attacks the away goal line: the ball is on the away (KC) 15
        { id: 'g3', away: 'N5', home: 'N6', score: [14, 35], ball: { poss: 'N6', terr: 'N5', yard: 15, down: '2nd & 8' } },
        // a team backed up at its own 15: not the red zone
        { id: 'g1', away: 'N2', home: 'N1', score: [10, 17], ball: { poss: 'N1', terr: 'N1', yard: 15, down: '1st & 10' } },
      ],
    });
    const a = await cardOf('N4', 'N3');
    const b = await cardOf('N5', 'N6');
    const c = await cardOf('N2', 'N1');
    expect(a.querySelector('.rzb')).not.toBeNull();
    expect(b.querySelector('.rzb')).not.toBeNull();
    expect(c.querySelector('.rzb')).toBeNull();
    expect(c).toHaveTextContent('n1 ball · 1st & 10 at the n1 15');
    expect(a.querySelector('.rzb')).toHaveTextContent('1st & goal at the n3 8');
    expect(b.querySelector('.rzb')).toHaveTextContent('2nd & 8 at the n5 15');
    expect(a.querySelector('.mf')).toHaveAttribute('data-red', 'true');
    expect(c.querySelector('.mf')).not.toHaveAttribute('data-red');
    // the sentence a screen reader gets, and the drawn pieces hidden from it
    expect(within(a).getByText('red zone: n4 first and goal at the n3 8')).toBeInTheDocument();
    expect(within(b).getByText('red zone: n6 second and 8 at the n5 15')).toBeInTheDocument();
    for (const el of a.querySelectorAll('.rzb-tag, .rzb-team, .rzb-where')) expect(el).toHaveAttribute('aria-hidden', 'true');
    // the badge's text in the page is lowercase: only the stylesheet draws it in capitals
    expect(a.querySelector('.rzb-tag')!.textContent).toBe('red zone');
  });

  it('knows the boundary: the 20 is in, the 21 is out; the pure helpers agree', () => {
    const at = (yard: number) => parseGameRows([game({ id: 'x', away: 'N4', home: 'N3', score: [0, 0], ball: { poss: 'N4', terr: 'N3', yard } }, 1)], 5)[0]!;
    expect(redZoneTeam(at(20))).toBe('N4');
    expect(redZoneTeam(at(21))).toBeNull();
    expect(redZoneSpoken(at(3))).toBe('red zone: n4 first and 10 at the n3 3');
    expect(redZoneLine(at(3))).toBe('n4 · 1st & 10 at the n3 3 · q2 7:30');
    expect(redZoneSpoken(at(40))).toBe('');
  });

  it('scopes the capital letters to the badge: one text-transform: uppercase in the page stylesheet, on .rzb-tag', () => {
    const css = readFileSync(`${process.cwd()}/src/styles/nfl.css`, 'utf8');
    const hits = css.split('\n').map((l, i) => ({ l, i })).filter((x) => /text-transform:\s*uppercase/.test(x.l));
    expect(hits).toHaveLength(1);
    const before = css.slice(0, css.split('\n').slice(0, hits[0]!.i + 1).join('\n').length);
    const selector = before.slice(before.lastIndexOf('}') + 1).trim();
    expect(selector.startsWith('.rzb-tag {')).toBe(true);
    expect(css).toMatch(/exception/);
    // and the badge never uses the channel's trademark
    expect(css + readFileSync(`${process.cwd()}/src/pages/nfl/RedZoneBadge.tsx`, 'utf8')).not.toMatch(/nfl\s*red\s*zone/i);
  });

  it('slides in only when a game newly enters the red zone between polls, and not under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('no-preference'), media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }));
    const { world, poll } = setup({ specs: inside({ poss: 'N4', terr: 'N3', yard: 40 }) });
    const before = await cardOf('N4', 'N3');
    expect(before.querySelector('.rzb')).toBeNull();
    world.specs = inside({ poss: 'N4', terr: 'N3', yard: 12, down: '1st & 10' });
    await poll();
    await waitFor(() => expect(document.querySelector('article[data-red="true"]')).not.toBeNull());
    const card = document.querySelector('article[data-red="true"]')!;
    expect(card).toHaveAttribute('data-entered', 'true');
    expect(card.querySelector('.rzb')).toHaveAttribute('data-enter', 'true');
    // it settles by itself
    await waitFor(() => expect(document.querySelector('article[data-entered]')).toBeNull(), { timeout: 3000 });
    expect(document.querySelector('.rzb')).not.toBeNull();
  });

  it('keeps the badge but skips the entrance when the viewer asked for reduced motion (jsdom answers that way)', async () => {
    const { world, poll } = setup({ specs: inside({ poss: 'N4', terr: 'N3', yard: 40 }) });
    await cardOf('N4', 'N3');
    world.specs = inside({ poss: 'N4', terr: 'N3', yard: 12, down: '1st & 10' });
    await poll();
    await waitFor(() => expect(document.querySelector('article[data-red="true"]')).not.toBeNull());
    expect(document.querySelector('[data-entered]')).toBeNull();
    expect(document.querySelector('.rzb')).not.toHaveAttribute('data-enter');
  });

  it('adds a red zone section at the top only while a drive is inside the 20, with the fantasy angle', async () => {
    const { world, poll, user } = setup();
    await cardOf('N2', 'N1');
    expect(screen.queryByRole('heading', { name: 'red zone' })).toBeNull();
    // N1, the team three of my starters play for, gets inside the 20
    world.specs = [{ ...DEFAULT[0]!, ball: { poss: 'N1', terr: 'N2', yard: 6, down: '1st & Goal' } }, DEFAULT[1]!, DEFAULT[2]!];
    await poll();
    const head = await screen.findByRole('heading', { name: 'red zone' });
    const section = head.closest('section')!;
    // it comes before the cards
    expect(section.compareDocumentPosition(screen.getAllByRole('article')[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section).toHaveTextContent('n1 · 1st & goal at the n2 6 · q2 7:30');
    expect(section.querySelectorAll('li')).toHaveLength(1);
    // your starters on the attacking team, by name, without claiming who is on the field
    expect(section).toHaveTextContent(/your Alex Arm/);
    expect(section).toHaveTextContent(/are on the attacking team/);
    expect(section).not.toHaveTextContent(/on the field/);
    expect(section.querySelectorAll('.avatar').length).toBeGreaterThan(0);
    // a tap on the drive opens the game
    await user.click(within(section).getByRole('button'));
    expect(await screen.findByRole('dialog', { name: /N2 at N1/i })).toBeInTheDocument();
  });

  it('hides the fantasy angle under "nfl only" but keeps the drives', async () => {
    const { user } = setup({ specs: [{ ...DEFAULT[0]!, ball: { poss: 'N1', terr: 'N2', yard: 6, down: '1st & Goal' } }, DEFAULT[1]!, DEFAULT[2]!] });
    const section = (await screen.findByRole('heading', { name: 'red zone' })).closest('section')!;
    expect(section).toHaveTextContent('attacking team');
    await user.click(screen.getByRole('button', { name: 'nfl only' }));
    const after = (await screen.findByRole('heading', { name: 'red zone' })).closest('section')!;
    expect(after).toHaveTextContent('n1 · 1st & goal at the n2 6');
    expect(after).not.toHaveTextContent('attacking team');
    expect(after.querySelectorAll('.avatar')).toHaveLength(0);
  });

  it('shows the compact badge in the game drawer', async () => {
    const { user } = setup({ specs: inside({ poss: 'N4', terr: 'N3', yard: 5, down: '1st & Goal' }) });
    await user.click(await open(/open game details, N4 at N3/));
    const dlg = await screen.findByRole('dialog', { name: /N4 at N3/i });
    const badge = dlg.querySelector('.rzb')!;
    expect(badge).toHaveAttribute('data-size', 'compact');
    expect(within(dlg).getByText('red zone: n4 first and goal at the n3 5')).toBeInTheDocument();
  });
});

describe('the "live now" strip on the scoreboard', () => {
  it('lists each live game in a sideways row of small cards that link to the live tab', async () => {
    const { user } = setup({ route: '/nfl?tab=scoreboard', specs: [DEFAULT[0]!, { id: 'g2', away: 'N4', home: 'N3', score: [20, 21], ball: { poss: 'N4', terr: 'N3', yard: 9, down: '1st & Goal' } }, DEFAULT[2]!] });
    const strip = await screen.findByRole('region', { name: /live now · 3/ });
    const cards = within(strip).getAllByRole('link', { name: /open the live tab/ });
    expect(cards).toHaveLength(3);
    // closest first
    expect(cards[0]).toHaveTextContent('N4');
    expect(cards[0]).toHaveTextContent('red zone');
    expect(cards[1]).not.toHaveTextContent('red zone');
    expect(within(strip).getByRole('link', { name: 'see all live games' })).toBeInTheDocument();
    await user.click(cards[1]!);
    await waitFor(() => expect(screen.getByRole('radio', { name: /^live · 3$/ })).toHaveAttribute('aria-checked', 'true'));
    expect(await cardOf('N2', 'N1')).toBeInTheDocument();
  });

  it('is not there when no game is on', async () => {
    setup({ route: '/nfl?tab=scoreboard', specs: [{ id: 'g1', away: 'N2', home: 'N1', score: [10, 17], state: 'final' }] });
    await screen.findByRole('group', { name: 'week 5 at a glance' });
    expect(screen.queryByText(/live now ·/)).toBeNull();
  });
});

describe('the whip-around', () => {
  const two = (a: Ball, b: Ball): Spec[] => [
    { id: 'g1', away: 'N2', home: 'N1', score: [10, 17], ball: a },
    { id: 'g2', away: 'N4', home: 'N3', score: [20, 21], ball: b },
    DEFAULT[2]!,
  ];
  const section = async () => (await screen.findByRole('heading', { name: 'red zone' })).closest('section')!;

  it('stands by in one slim line while games are on and no drive is inside the 20', async () => {
    setup();
    await cardOf('N2', 'N1');
    expect(screen.getByText('standing by · no drive inside the 20 right now')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'red zone' })).toBeNull();
  });

  it('gives each drive inside the 20 a split-screen tile, the one nearest the goal line first, with a red scoreboard clock and the yards to go', async () => {
    setup({ specs: two({ poss: 'N1', terr: 'N2', yard: 17, down: '2nd & 8' }, { poss: 'N4', terr: 'N3', yard: 3, down: '1st & Goal' }) });
    const s = await section();
    const tiles = s.querySelectorAll('.rzw-tile');
    expect(tiles).toHaveLength(2);
    expect(s.querySelector('.rzw-grid')).toHaveAttribute('data-count', '2');
    // nearest the goal line first, and loudest inside the 5
    expect(tiles[0]!.querySelector('.rzw-abbr')).toHaveTextContent('N4');
    expect(tiles[0]).toHaveAttribute('data-goal', 'true');
    expect(tiles[1]).not.toHaveAttribute('data-goal');
    expect(tiles[0]!.querySelector('.rzw-clock-q')).toHaveTextContent('q2');
    expect(tiles[0]!.querySelector('.rzw-clock-t')).toHaveTextContent('7:30');
    expect(tiles[0]!.querySelector('.rzw-out')).toHaveTextContent('3 to go');
    expect(tiles[1]!.querySelector('.rzw-out')).toHaveTextContent('17 to go');
    // the screen reader gets the drive's sentence; the drawn pieces are hidden
    expect(within(tiles[0] as HTMLElement).getByText('n4 · 1st & goal at the n3 3 · q2 7:30')).toBeInTheDocument();
    for (const el of tiles[0]!.querySelectorAll('.rzw-tile-top, .rzw-tile-main, .rzw-down, .rzw-zone')) expect(el).toHaveAttribute('aria-hidden', 'true');
    // the live card of a red-zone game carries the same clock
    const card = await cardOf('N4', 'N3');
    expect(card.querySelector('.nf-lv-top .rzw-clock-t')).toHaveTextContent('7:30');
  });

  it('holds a drive that scores from inside the 20 for a moment with the call, flashes "touchdown" on its card, then lets it go', async () => {
    const { world, poll } = setup({ specs: two({ poss: 'N1', terr: 'N1', yard: 30 }, { poss: 'N4', terr: 'N3', yard: 4, down: '1st & Goal' }) });
    await section();
    // touchdown and the try: the ball goes back to the other team at its own 25
    world.specs = two({ poss: 'N1', terr: 'N1', yard: 30 }, { poss: 'N3', terr: 'N3', yard: 25, down: '1st & 10' }).map((s) => (s.id === 'g2' ? { ...s, score: [27, 21] } : s));
    await poll();
    const tile = await waitFor(() => {
      const t = document.querySelector('.rzw-tile[data-call="touchdown"]');
      expect(t).not.toBeNull();
      return t!;
    });
    expect(tile.querySelector('.rzw-call-word')).toHaveTextContent('touchdown');
    expect(tile.querySelector('.rzw-call-pts')).toHaveTextContent('+7 N4');
    expect(within(tile as HTMLElement).getByText('touchdown, n4: n4 27, n3 21')).toBeInTheDocument();
    const card = (await cardOf('N4', 'N3'));
    expect(card).toHaveAttribute('data-td', 'true');
    expect(card.querySelector('.rzw-td-word')).toHaveTextContent('touchdown');
    // the drive is over: the tile goes, and the section with it
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'red zone' })).toBeNull(), { timeout: 9_500 });
    expect(screen.getByText(/standing by/)).toBeInTheDocument();
  }, 20_000);

  it('calls nothing for a score by the team without the ball inside the 20, or by a team seen there long ago', async () => {
    const { world, poll } = setup({ specs: two({ poss: 'N1', terr: 'N1', yard: 30 }, { poss: 'N4', terr: 'N3', yard: 4, down: '1st & Goal' }) });
    await section();
    // the other team (N3) scores: a pick six, say
    world.specs = two({ poss: 'N1', terr: 'N1', yard: 30 }, { poss: 'N4', terr: 'N4', yard: 25, down: '1st & 10' }).map((s) => (s.id === 'g2' ? { ...s, score: [20, 28] } : s));
    await poll();
    await waitFor(() => expect(document.querySelector('.nf-lv-chip')).not.toBeNull());
    expect(document.querySelector('.rzw-tile[data-call]')).toBeNull();
  });

  it('is pure about the rules: what a score was, and the clock as a scoreboard shows it', () => {
    expect([1, 2, 3, 6, 7, 8, 10].map(scoreKind)).toEqual(['score', 'score', 'field goal', 'touchdown', 'touchdown', 'touchdown', 'touchdown']);
    expect(clockParts({ quarter: '4', clock: '0:01', state: 'live' })).toEqual({ period: 'q4', clock: '0:01' });
    expect(clockParts({ quarter: 'OT', clock: '9:12', state: 'live' })).toEqual({ period: 'ot', clock: '9:12' });
    expect(clockParts({ quarter: 'H', clock: '', state: 'live' })).toEqual({ period: '', clock: '' });
  });

  it('keeps the capitals and the motion in their place, and carries no channel or league marks', () => {
    const css = readFileSync(`${process.cwd()}/src/styles/whiparound.css`, 'utf8');
    const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*text-transform:\s*uppercase[^{}]*\}/g)];
    expect(rules).toHaveLength(1);
    for (const sel of rules[0]![1]!.split(',')) expect(sel.trim()).toMatch(/^\.rzw-/);
    // every animation runs only inside the no-preference query
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    const outside = blocks.reduce((rest, b) => rest.replace(b, ''), css);
    expect(blocks.join('\n')).toMatch(/animation: rzw-/);
    expect(outside).not.toMatch(/animation(-name)?:/);
    // style, not marks: no channel name, no network, no league shield
    const src = css + readFileSync(`${process.cwd()}/src/pages/nfl/WhipAround.tsx`, 'utf8');
    expect(src).not.toMatch(/\bredzone\b|nfl\s*network|nfl\s*red\s*zone|shield/i);
  });
});
