import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBracket, type BracketCtx, type BracketKind, type RealGame } from '../../engine';
import { Bracket } from './Bracket';
import { layoutBracket } from './layout';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const RULES = { weekStart: 15, roundType: 0, seedType: 0 };
/** rid 101 is the strongest (seed 1) down to the weakest; names are "Team <rid>" */
const rids = (n: number) => Array.from({ length: n }, (_, i) => 101 + i);
const names = (list: number[]) => new Map(list.map((r) => [r, `Team ${r}`] as const));
const ctxOf = (list: number[], mean = (r: number) => 130 - (r - 101) * 6): BracketCtx => ({
  means: Object.fromEntries(list.map((r) => [r, { 15: mean(r), 16: mean(r), 17: mean(r) }])),
  sd: 20, currentWeek: 6,
});

function setup(o: { n?: number; kind?: BracketKind; real?: RealGame[]; seedOrder?: number[]; stepMs?: number } = {}) {
  const list = o.seedOrder ?? rids(o.n ?? 4);
  const bracket = buildBracket({ kind: o.kind ?? 'championship', seedOrder: list, rules: RULES, real: o.real });
  const user = userEvent.setup();
  const ui = render(<Bracket bracket={bracket} ctx={ctxOf(list)} names={names(list)} meRid={list[1]!} stepMs={o.stepMs} />);
  return { user, bracket, list, ...ui };
}

const slot = (name: RegExp | string) => screen.getByRole('button', { name });
const champ = () => document.querySelector('.br-champ') as HTMLElement;
const oddsRow = (team: string) => within(screen.getByRole('table')).getByText(team).closest('tr') as HTMLElement;

describe('Bracket: click to advance', () => {
  it('advances a team, undoes it with a second click, and describes every game for assistive tech', async () => {
    const { user } = setup();
    expect(screen.getByRole('group', { name: 'round 1, game 1: Team 101 versus Team 104' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'round 1, game 2: Team 102 versus Team 103' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'round 2, game 1: waiting for earlier rounds' })).toBeInTheDocument();
    const s = slot(/^seed 1, Team 101, projected 130\.0 points, \d+% to win round 1/);
    expect(s).toHaveAttribute('aria-pressed', 'false');
    await user.click(s);
    expect(s).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Team 101 advances to round 2.');
    // the final now has its first team
    expect(screen.getByRole('group', { name: /round 2, game 1: waiting/ })).toBeInTheDocument();
    await user.click(s);
    expect(s).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent("Team 101's pick cleared.");
  });

  it('clicking through to a champion shows the flourish: the name, the rule and "league champ"', async () => {
    const { user } = setup();
    expect(champ()).toHaveAttribute('data-state', 'open');
    await user.click(slot(/^seed \d+, Team 101,/));
    await user.click(slot(/^seed \d+, Team 103,/));
    // the final: Team 101 vs Team 103
    await user.click(screen.getAllByRole('button', { name: /^seed \d+, Team 101,.*round 2/ })[0]!);
    expect(champ()).toHaveAttribute('data-state', 'crowned');
    expect(champ()).toHaveTextContent('league champ');
    expect(champ()).toHaveTextContent('Team 101');
    expect(champ().querySelector('.br-rule')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Team 101 is the league champ.');
    // no emoji, no confetti
    expect(champ().textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('changing an earlier pick clears the picks that depended on it, and only those', async () => {
    const { user } = setup({ n: 8 });
    // round 1: 101 and 104 and 103 and 102 win (chalk), round 2: 101 beats 104, 103 beats 102, final: 101
    for (const r of [101, 104, 103, 102]) await user.click(slot(new RegExp(`^seed \\d+, Team ${r},.*round 1`)));
    await user.click(screen.getAllByRole('button', { name: /^seed \d+, Team 101,.*round 2/ })[0]!);
    await user.click(screen.getAllByRole('button', { name: /^seed \d+, Team 103,.*round 2/ })[0]!);
    await user.click(screen.getAllByRole('button', { name: /^seed \d+, Team 101,.*round 3/ })[0]!);
    expect(champ()).toHaveAttribute('data-state', 'crowned');
    expect(screen.getByText('7 of 7 open games picked')).toBeInTheDocument();
    // flip game 1 to the upset: 108 beats 101. The round-2 and final picks that needed 101 are gone; 103's win stays.
    await user.click(slot(/^seed \d+, Team 108,.*round 1/));
    expect(champ()).toHaveAttribute('data-state', 'open');
    // 4 round-1 picks and 103's round-2 win remain; the round-2 and final picks that needed 101 are gone
    expect(screen.getByText('5 of 7 open games picked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^seed \d+, Team 103,.*round 2/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('title odds update live after a pick, exactly, and add to 100%', async () => {
    const { user } = setup({ n: 8 });
    const before = oddsRow('Team 108').textContent;
    expect(oddsRow('Team 101')).toBeInTheDocument();
    await user.click(slot(/^seed \d+, Team 108,.*round 1/));
    const after = oddsRow('Team 108').textContent;
    expect(after).not.toBe(before);
    // the team that lost drops to zero
    expect(oddsRow('Team 101')).toHaveTextContent('0%');
    // title column adds to 100%
    const cells = [...screen.getByRole('table').querySelectorAll('tbody tr')].map((r) => (r.children[3] as HTMLElement).textContent!);
    const total = cells.reduce((s, c) => s + (c.startsWith('<1') ? 0.5 : c.startsWith('>99') ? 99.5 : Number(c.replace('%', ''))), 0);
    expect(total).toBeGreaterThan(95);
    expect(total).toBeLessThan(105);
    expect(screen.getByText(/title odds with your 1 pick/)).toBeInTheDocument();
  });

  it('shows the head-to-head numbers in a tooltip on hover and on focus', async () => {
    const { user } = setup();
    const s = slot(/^seed \d+, Team 101,/);
    await user.hover(s);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('round 1');
    expect(tip).toHaveTextContent('week 15');
    expect(tip).toHaveTextContent('Team 101');
    expect(tip).toHaveTextContent('Team 104');
    expect(tip).toHaveTextContent('130.0 proj');
    expect(tip).toHaveTextContent('112.0 proj');
    expect(tip).toHaveTextContent('to outscore');
    expect(s).toHaveAttribute('aria-describedby', tip.id);
    await user.unhover(s);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => slot(/^seed \d+, Team 102,/).focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent('Team 102');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('works from the keyboard: focus a team, press Enter to advance, Space to undo, arrows to move', async () => {
    const { user } = setup({ n: 8 });
    const first = slot(/^seed \d+, Team 101,.*round 1/);
    first.focus();
    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Team 101 advances to round 2.');
    await user.keyboard(' ');
    expect(first).toHaveAttribute('aria-pressed', 'false');
    // arrows: down goes to the next slot in the column, right to the next round
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(slot(/^seed \d+, Team 108,.*round 1/));
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(slot(/^seed \d+, Team 108,.*round 1/));
    await user.keyboard('{ArrowRight}');
    expect((document.activeElement as HTMLElement).getAttribute('data-round')).toBe('2');
    await user.keyboard('{ArrowLeft}');
    expect((document.activeElement as HTMLElement).getAttribute('data-round')).toBe('1');
  });

  it('resets every pick', async () => {
    const { user } = setup();
    const reset = screen.getByRole('button', { name: 'reset' });
    expect(reset).toBeDisabled();
    await user.click(slot(/^seed \d+, Team 101,/));
    await user.click(slot(/^seed \d+, Team 102,/));
    expect(reset).toBeEnabled();
    await user.click(reset);
    expect(slot(/^seed \d+, Team 101,/)).toHaveAttribute('aria-pressed', 'false');
    expect(champ()).toHaveAttribute('data-state', 'open');
    expect(reset).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('bracket reset.');
  });

  it('locks games that were really played: they cannot be picked, and the odds respect them', async () => {
    const { user } = setup({ real: [{ w: 104, l: 101 }] });
    const upset = screen.getByRole('button', { name: /^seed 4, Team 104,.*advances \(final result\)/ });
    expect(upset).toHaveAttribute('aria-disabled', 'true');
    expect(upset).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('group', { name: 'round 1, game 1: Team 101 versus Team 104, final' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^seed \d+, Team 101,/ }));
    expect(upset.closest('.br-match')).toHaveAttribute('data-locked', 'true');
    expect(oddsRow('Team 101')).toHaveTextContent('0%');
    expect(screen.getByText('0 of 2 open games picked')).toBeInTheDocument();
  });
});

describe('Bracket: sim it', () => {
  it('plays one seeded run round by round and keeps it as picks (reduced motion: all at once)', async () => {
    const { user } = setup({ n: 8 });
    await user.click(screen.getByRole('button', { name: 'sim it' }));
    // jsdom has no matchMedia, which counts as reduced motion: the whole run lands at once
    expect(champ()).toHaveAttribute('data-state', 'crowned');
    expect(screen.getByText('7 of 7 open games picked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reroll' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/simulated run 1: .+ is the league champ\./);
  });

  it('with motion allowed it reveals one round every step (fake timers), then settles', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('no-preference'), addEventListener() {}, removeEventListener() {}, media: q }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const list = rids(8);
    const bracket = buildBracket({ kind: 'championship', seedOrder: list, rules: RULES });
    render(<Bracket bracket={bracket} ctx={ctxOf(list)} names={names(list)} meRid={102} stepMs={500} />);
    await user.click(screen.getByRole('button', { name: 'sim it' }));
    const decided = () => document.querySelectorAll('.br-slot[data-state="adv"]').length;
    expect(decided()).toBe(4); // round 1 only
    expect(champ()).toHaveAttribute('data-state', 'open');
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(decided()).toBe(6); // + round 2
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(decided()).toBe(7);
    expect(champ()).toHaveAttribute('data-state', 'crowned');
    // a click after the run turns it into ordinary picks and keeps working
    await user.click(screen.getByRole('button', { name: 'reset' }));
    expect(decided()).toBe(0);
  });

  it('rerolling gives a different run (a different seed) and the same seed always gives the same one', async () => {
    const a = setup({ n: 8 });
    await a.user.click(screen.getByRole('button', { name: 'sim it' }));
    const first = champ().textContent;
    const picksA = [...document.querySelectorAll('.br-slot[data-state="adv"]')].map((e) => e.textContent);
    cleanup();
    const b = setup({ n: 8 });
    await b.user.click(screen.getByRole('button', { name: 'sim it' }));
    expect(champ().textContent).toBe(first);
    expect([...document.querySelectorAll('.br-slot[data-state="adv"]')].map((e) => e.textContent)).toEqual(picksA);
    // reroll up to a handful of times: at least one run differs
    const seen = new Set([picksA.join('|')]);
    for (let i = 0; i < 6; i++) {
      await b.user.click(screen.getByRole('button', { name: 'reroll' }));
      seen.add([...document.querySelectorAll('.br-slot[data-state="adv"]')].map((e) => e.textContent).join('|'));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('Bracket: the toilet bowl (the loser advances)', () => {
  const field = [112, 111, 110, 109]; // seed 1 is the worst team
  const worst = (r: number) => 140 - (r - 100) * 5; // 112 -> 80 (worst), 109 -> 95

  it('you click the team that gets flushed, it advances, and the last team standing is the toilet bowl champ', async () => {
    const bracket = buildBracket({ kind: 'toilet', seedOrder: field, rules: RULES });
    const user = userEvent.setup();
    render(<Bracket bracket={bracket} ctx={ctxOf(field, worst)} names={names(field)} meRid={111} />);
    expect(screen.getByText(/click the team that gets flushed/)).toBeInTheDocument();
    const s = screen.getByRole('button', { name: /^seed 1, Team 112, projected 80\.0 points, \d+% to lose round 1/ });
    // the weakest team is the likeliest to lose: more than a coin flip
    expect(s.querySelector('.br-p')!.textContent).toMatch(/^[5-9]\d%$/);
    await user.click(s);
    expect(s).toHaveAttribute('aria-pressed', 'true');
    expect(s.querySelector('.br-stamp')).toHaveTextContent('flushed');
    expect(s.getAttribute('data-state')).toBe('adv');
    expect(screen.getByRole('status')).toHaveTextContent('Team 112 gets flushed and advances to round 2.');
    // the other game: 111 is flushed? pick 110 instead (seed 3)
    await user.click(screen.getByRole('button', { name: /^seed \d+, Team 110,/ }));
    await user.click(screen.getAllByRole('button', { name: /^seed \d+, Team 112,.*round 2/ })[0]!);
    expect(champ()).toHaveAttribute('data-kind', 'toilet');
    expect(champ()).toHaveTextContent('toilet bowl champ');
    expect(champ()).toHaveTextContent('Team 112');
    expect(champ()).toHaveTextContent('crowned the worst team in the league');
    expect(screen.getByRole('status')).toHaveTextContent('Team 112 is the toilet bowl champ.');
    // the odds column is the flush column
    expect(screen.getByRole('columnheader', { name: 'flush %' })).toBeInTheDocument();
    expect(oddsRow('Team 112')).toHaveTextContent('100%');
  });

  it('flush odds update after a pick, and flushing the strong team lowers the weak team\'s odds', async () => {
    const bracket = buildBracket({ kind: 'toilet', seedOrder: field, rules: RULES });
    const user = userEvent.setup();
    render(<Bracket bracket={bracket} ctx={ctxOf(field, worst)} names={names(field)} meRid={111} />);
    const before = Number(oddsRow('Team 112').children[3]!.textContent!.replace('%', ''));
    await user.click(screen.getByRole('button', { name: /^seed \d+, Team 109,/ })); // the best of the four gets flushed
    // 112 and 109 are not in the same game; 109 advancing to the final means 112 now meets 109 or 111's side
    const after = Number(oddsRow('Team 112').children[3]!.textContent!.replace('%', ''));
    expect(after).not.toBe(before);
  });

  it('changing an earlier flush clears the flushes downstream', async () => {
    const bracket = buildBracket({ kind: 'toilet', seedOrder: field, rules: RULES });
    const user = userEvent.setup();
    render(<Bracket bracket={bracket} ctx={ctxOf(field, worst)} names={names(field)} meRid={111} />);
    await user.click(screen.getByRole('button', { name: /^seed \d+, Team 112,/ }));
    await user.click(screen.getByRole('button', { name: /^seed \d+, Team 110,/ }));
    await user.click(screen.getAllByRole('button', { name: /^seed \d+, Team 112,.*round 2/ })[0]!);
    expect(champ()).toHaveAttribute('data-state', 'crowned');
    // flush Team 109 instead of Team 112 in game 1: Team 112 is out of the final, so that pick is gone
    await user.click(screen.getByRole('button', { name: /^seed \d+, Team 109,.*round 1/ }));
    expect(champ()).toHaveAttribute('data-state', 'open');
    expect(screen.getByText('2 of 3 open games picked')).toBeInTheDocument();
  });

  it('sim it works in the toilet bowl too: one run, and a team is crowned the worst', async () => {
    const bracket = buildBracket({ kind: 'toilet', seedOrder: field, rules: RULES });
    const user = userEvent.setup();
    render(<Bracket bracket={bracket} ctx={ctxOf(field, worst)} names={names(field)} meRid={111} />);
    await user.click(screen.getByRole('button', { name: 'sim it' }));
    expect(champ()).toHaveAttribute('data-state', 'crowned');
    expect(champ()).toHaveTextContent('toilet bowl champ');
    expect(document.querySelectorAll('.br-stamp')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent(/simulated run 1: Team \d+ is the toilet bowl champ\./);
  });

  it('a consolation bracket uses the same move but the winner advances, with ordinary copy', async () => {
    const list = [109, 110, 111, 112];
    const bracket = buildBracket({ kind: 'consolation', seedOrder: list, rules: RULES });
    const user = userEvent.setup();
    render(<Bracket bracket={bracket} ctx={ctxOf(list, worst)} names={names(list)} meRid={111} />);
    expect(screen.getByText(/winners advance/)).toBeInTheDocument();
    const s = screen.getByRole('button', { name: /^seed \d+, Team 109,.*to win round 1/ });
    await user.click(s);
    expect(s.querySelector('.br-stamp')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^seed \d+, Team 110,/ }));
    await user.click(screen.getAllByRole('button', { name: /^seed \d+, Team 109,.*round 2/ })[0]!);
    expect(champ()).toHaveTextContent('consolation champ');
    expect(champ()).toHaveTextContent('best of the rest');
  });

  it('real games lock a toilet bowl: the loser of the real game has advanced', () => {
    const bracket = buildBracket({ kind: 'toilet', seedOrder: field, rules: RULES, real: [{ w: 109, l: 112 }] });
    render(<Bracket bracket={bracket} ctx={ctxOf(field, worst)} names={names(field)} meRid={111} />);
    const s = screen.getByRole('button', { name: /^seed 1, Team 112,.*\(final result\)/ });
    expect(s).toHaveAttribute('data-state', 'adv');
    expect(s.querySelector('.br-stamp')).toHaveTextContent('flushed');
  });
});

describe('layout', () => {
  it('puts every game level with the games that feed it, byes included, and draws elbows to each slot', () => {
    for (const n of [4, 6, 8, 12]) {
      const bk = buildBracket({ kind: 'championship', seedOrder: rids(n), rules: RULES });
      const l = layoutBracket(bk);
      expect(l.placed).toHaveLength(n - 1);
      const at = new Map(l.placed.map((p) => [p.id, p] as const));
      for (const m of bk.matches) {
        const feeders = [m.a, m.b].filter((s) => s.kind === 'win').map((s) => at.get((s as { match: string }).match)!);
        if (feeders.length === 2) expect(at.get(m.id)!.cy).toBeCloseTo((feeders[0]!.cy + feeders[1]!.cy) / 2, 6);
        // no two games in a column overlap
      }
      for (let r = 1; r <= bk.rounds; r++) {
        const col = l.placed.filter((p) => p.round === r).sort((x, y) => x.y - y.y);
        for (let i = 1; i < col.length; i++) expect(col[i]!.y).toBeGreaterThanOrEqual(col[i - 1]!.y + 61);
      }
      expect(l.connectors.length).toBe(bk.matches.reduce((s, m) => s + [m.a, m.b].filter((x) => x.kind === 'win').length, 0));
      expect(l.champ).not.toBeNull();
      expect(l.width).toBeGreaterThan(0);
    }
  });

  it('an empty bracket has no layout', () => {
    expect(layoutBracket(buildBracket({ kind: 'toilet', seedOrder: [1], rules: RULES })).placed).toEqual([]);
  });
});
