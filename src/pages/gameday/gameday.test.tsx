import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeSleeper, liveSampleModel, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, sampleScores,
} from '../../test/fakes';
import type { FakeGameState } from '../../test/fakes';
import { renderApp } from '../../app/testUtils';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const linked = [sampleAccount()];
const MIN = 60_000, DAY = 86_400_000;

interface Setup {
  pts?: Record<string, number>;
  last?: Record<string, number>;
  a?: FakeGameState;
  b?: FakeGameState;
  kickoff?: number;
  mu?: Record<string, number>;
  /** what week 5's scores endpoint says; defaults to the a/b states */
  route?: string;
}

/** A fake league whose live endpoints read from a mutable `state`, so a test can change the points between polls. */
function setup(o: Setup = {}) {
  const state = { pts: o.pts ?? {}, last: o.last ?? { t1qb: 18, t1rb: 12, t1wr: 9, t2qb: 12, t2rb: 8, t2wr: 7, t3qb: 14, t3rb: 6, t3wr: 5, t4qb: 9, t4rb: 9, t4wr: 9 }, a: o.a ?? 'live', b: o.b ?? 'final', kickoff: o.kickoff };
  const sleeper = createFakeSleeper({
    live: {
      matchups: (w) => sampleLiveMatchups(w === 5 ? state.pts : state.last),
      scores: (w) => (w === 5 ? sampleScores({ a: state.a, b: state.b, kickoff: state.kickoff }) : sampleScores({ a: 'final', b: 'final', kickoff: Date.now() - 8 * DAY })),
      projections: () => sampleLiveProjections(o.mu),
    },
  });
  const utils = renderApp({ linked, route: o.route ?? '/gameday', sleeper, loadModel: sampleLoadModel(liveSampleModel) });
  return { state, ...utils };
}

const board = () => screen.getByRole('group', { name: 'scoreboard' });

describe('game day: pre-game', () => {
  it('shows projections, the pre-game win chance and the kickoff time', async () => {
    setup({ a: 'pre', b: 'pre', kickoff: Date.now() + 5 * MIN });
    await screen.findByRole('heading', { level: 2, name: 'the main event' });
    // team 1 projects 20 + 15 + 12 = 47, team 2 19 + 14 + 13 = 46
    await waitFor(() => expect(board()).toHaveTextContent('47.0'));
    expect(board()).toHaveTextContent('46.0');
    expect(board()).toHaveTextContent('Sunday Scaries');
    expect(screen.getByText(/^kickoff /, { selector: '.gd-status-line' })).toBeInTheDocument();
    expect(screen.queryByText('live')).not.toBeInTheDocument();
    // answer first: the meter says who is favored before anyone plays, and the starters wait on deck
    expect(screen.getByRole('img', { name: /Sunday Scaries \d+% to win/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /on deck 6/ })).toBeInTheDocument();
  });
});

describe('game day: live', () => {
  const pts = { t1qb: 10, t1rb: 5, t1wr: 6, t2qb: 4, t2rb: 3, t2wr: 2, t3qb: 5, t3rb: 5, t3wr: 5, t4qb: 30, t4rb: 15, t4wr: 15 };

  it('shows the scoreboard, who is left, and updates when the data changes', async () => {
    const { state, user } = setup({ pts, mu: { t3qb: 20, t3rb: 15, t3wr: 12, t4qb: 5, t4rb: 5, t4wr: 5 } });
    await waitFor(() => expect(board()).toHaveTextContent('21.0'));
    expect(board()).toHaveTextContent('9.0');
    expect(screen.getByText('Sunday Scaries ahead by 12.0 · 6 starters left')).toBeInTheDocument();
    // projection = actual + mu × share left: game at q2 7:30 is 0.375 played
    expect(screen.getByText(/projected/, { selector: '.gd-side:first-child .gd-sub' })).toHaveTextContent('projected 50.4');
    // the starters carry the quarter and clock
    expect(screen.getAllByText('q2 7:30').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /Sunday Scaries \d+% to win, Reed Between the Lines \d+%; before kickoff/ })).toBeInTheDocument();

    state.pts = { ...pts, t1qb: 16.4 };
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(board()).toHaveTextContent('27.4'));

    // the drive chart saw the +6.4
    await user.click(screen.getByRole('radio', { name: 'the drive chart' }));
    const feed = await screen.findByRole('list', { name: /scoring updates/ });
    expect(within(feed).getByText('+6.4')).toBeInTheDocument();
    expect(within(feed).getByText('alex arm')).toBeInTheDocument();
    expect(within(feed).getByText(/n1 vs n2/)).toBeInTheDocument();
  });

  it('tags upset alert and blowout on a matchup, nail-biter on another', async () => {
    const { user } = setup({ pts, mu: { t3qb: 20, t3rb: 15, t3wr: 12, t4qb: 5, t4rb: 5, t4wr: 5 }, b: 'live' });
    // matchup 2 is a blowout by the 15-point underdog; matchup 1 is within 12 with players left
    // only the other matchup is a card; its two tags are visible
    const cards = await screen.findAllByRole('button', { name: /open as the main event/ });
    expect(cards).toHaveLength(1);
    expect(within(cards[0]!).getByText('upset alert')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('blowout')).toBeInTheDocument();
    // focus the other matchup: mine becomes a card with the nail-biter tag, and the page offers a way back
    await user.click(cards[0]!);
    const mine = await screen.findByRole('button', { name: /Sunday Scaries 21\.0/ });
    expect(within(mine).getByText('nail-biter')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'back to my matchup' }));
    await waitFor(() => expect(board()).toHaveTextContent('Sunday Scaries'));
  });

  it('lists the game balls, and the points left on the sideline', async () => {
    const { user } = setup({ pts: { ...pts, t1bw: 22 } });
    await user.click(await screen.findByRole('radio', { name: 'game balls' }));
    const items = screen.getAllByRole('listitem');
    expect(items.some((li) => /Tom Thrower|Ted Tosser/.test(li.textContent ?? ''))).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'left on the sideline' }));
    // team 1 started a 6-point wideout and benched a 22: the best lineup is 16 points better
    const row = (await screen.findByText('Sunday Scaries', { selector: '.gd-side-rows .gd-pname' })).closest('li')!;
    expect(row).toHaveTextContent('Backup Wideout sat for 22.0');
    expect(row).toHaveTextContent('+16.0');
  });
});

describe('game day: off-day', () => {
  it('shows last week’s finals and the next kickoff when nothing is on today', async () => {
    setup({ a: 'pre', b: 'pre', kickoff: Date.now() + 3 * DAY });
    await screen.findByText('week 4 · final');
    // last week's numbers: team 1 scored 18 + 12 + 9 = 39
    await waitFor(() => expect(board()).toHaveTextContent('39.0'));
    expect(screen.getByText(/next kickoff: /)).toBeInTheDocument();
    // a final matchup shows the result, not a live chance
    expect(screen.getByRole('img', { name: /won/ })).toBeInTheDocument();
  });

  it('can switch to this week’s projections', async () => {
    const { user } = setup({ a: 'pre', b: 'pre', kickoff: Date.now() + 3 * DAY });
    await screen.findByText('week 4 · final');
    await user.click(screen.getByRole('radio', { name: 'week 5' }));
    await screen.findByText('week 5 · projected');
    await waitFor(() => expect(board()).toHaveTextContent('47.0'));
  });
});

describe('game day: replay', () => {
  it('replays last week through the same page, with controls and a replay chip', async () => {
    const { user } = setup({ a: 'pre', b: 'pre', kickoff: Date.now() + 3 * DAY });
    await user.click(await screen.findByRole('button', { name: 'replay week 4' }));
    const controls = await screen.findByRole('group', { name: 'replay controls' });
    expect(within(controls).getByText('replay · week 4')).toBeInTheDocument();
    // it plays on its own; pausing flips the button
    await user.click(within(controls).getByRole('button', { name: 'pause' }));
    expect(within(controls).getByRole('button', { name: 'play' })).toBeInTheDocument();
    // speed
    await user.click(within(controls).getByRole('radio', { name: '4×' }));
    expect(within(controls).getByRole('radio', { name: '4×' })).toBeChecked();
    expect(within(controls).getByRole('progressbar', { name: 'replay progress' })).toBeInTheDocument();
    // the page is the same main event, labelled as a replay
    expect(screen.getByText('replay · week 4', { selector: '.gd-status-line' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'week 4' })).not.toBeInTheDocument();
    await user.click(within(controls).getByRole('button', { name: 'stop replay' }));
    expect(await screen.findByRole('button', { name: 'replay week 4' })).toBeInTheDocument();
  });
});

describe('game day: no live source', () => {
  it('says what it needs instead of breaking', async () => {
    renderApp({ linked, route: '/gameday', loadModel: sampleLoadModel(liveSampleModel) });
    expect(await screen.findByText(/game day needs a league/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'game day' })).toBeInTheDocument();
  });
});
