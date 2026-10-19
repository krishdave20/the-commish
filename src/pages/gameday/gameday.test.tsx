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
  route?: string;
  /** extra feed metadata for the first game (N2 at N1): the ball, the down, the timeouts, the quarters */
  meta?: Record<string, unknown>;
}

/** A fake league whose live endpoints read from a mutable `state`, so a test can change the points between polls. */
function setup(o: Setup = {}) {
  const state = { pts: o.pts ?? {}, last: o.last ?? { t1qb: 18, t1rb: 12, t1wr: 9, t2qb: 12, t2rb: 8, t2wr: 7, t3qb: 14, t3rb: 6, t3wr: 5, t4qb: 9, t4rb: 9, t4wr: 9 }, a: o.a ?? 'live', b: o.b ?? 'final', kickoff: o.kickoff };
  const sleeper = createFakeSleeper({
    live: {
      matchups: (w) => sampleLiveMatchups(w === 5 ? state.pts : state.last),
      scores: (w) => (w === 5
        ? sampleScores({ a: state.a, b: state.b, kickoff: state.kickoff }).map((g) => (g.game_id === 'g1' ? { ...g, metadata: { ...g.metadata, ...o.meta } } : g))
        : sampleScores({ a: 'final', b: 'final', kickoff: Date.now() - 8 * DAY })),
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
    // the win meter is a field: the ball sits on a yard, the labels say the same in words
    expect(document.querySelector('.art-ball')).toHaveAttribute('data-yard');
    expect(screen.getByText(/of every 100 simulations on the projections/)).toBeInTheDocument();
    expect(document.querySelectorAll('.art-turf-ez')).toHaveLength(2);
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

    // the win meter field moved the ball to the yard of the new win chance, and its label says where
    expect(document.querySelector('.art-ball')).toHaveAttribute('data-yard');
    expect(screen.getByRole('img', { name: /the ball is on / })).toBeInTheDocument();

    // the drive chart saw the +6.4
    await user.click(screen.getByRole('radio', { name: 'the drive chart' }));
    const feed = await screen.findByRole('list', { name: /scoring updates/ });
    expect(within(feed).getByText('+6.4')).toBeInTheDocument();
    // and a turf field above the list has one football for each play in it, your team's in green; each is a button named by its points, then the context
    const field = screen.getByRole('figure');
    expect(field.querySelectorAll('.dt-mark')).toHaveLength(within(feed).getAllByRole('listitem').length);
    expect(field.querySelectorAll('.dt-mark[data-side="me"]').length).toBeGreaterThan(0);
    expect(within(field).getByRole('button', { name: '+6.4 alex arm, n1 vs n2, q2 7:30' })).toBeInTheDocument();
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
    const mine = await within(screen.getByRole('main')).findByRole('button', { name: /Sunday Scaries 21\.0/ });
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
    // the final whistle: a whistle beside the status, and the off-day field strip beside the next kickoff
    expect(document.querySelector('.gd-status-line .art-blow')).toBeInTheDocument();
    expect(document.querySelector('.gd-next-row svg.gd-off-art')).toHaveAttribute('aria-hidden', 'true');
  });

  it('can switch to this week’s projections', async () => {
    const { user } = setup({ a: 'pre', b: 'pre', kickoff: Date.now() + 3 * DAY });
    await screen.findByText('week 4 · final');
    await user.click(screen.getByRole('button', { name: 'week 5 (this week)' }));
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

describe('game day: every past week', () => {
  const lastWeek = { t1qb: 18, t1rb: 12, t1wr: 9, t2qb: 12, t2rb: 8, t2wr: 7, t3qb: 14, t3rb: 6, t3wr: 5, t4qb: 9, t4rb: 9, t4wr: 9 };

  it('has a chip for every week from 1 to this one, and this week is the one on screen', async () => {
    setup({ a: 'live' });
    const picker = await screen.findByRole('group', { name: 'week' });
    const chips = within(picker).getAllByRole('button', { name: /^week \d/ });
    expect(chips.map((c) => c.textContent)).toEqual(['1week 1', '2week 2', '3week 3', '4week 4', '5week 5 (this week)']);
    expect(within(picker).getByRole('button', { name: 'week 5 (this week)' })).toHaveAttribute('aria-current', 'true');
    expect(within(picker).getByRole('button', { name: 'next week' })).toBeDisabled();
  });

  it('opens on the week in the URL and changes it when a chip is pressed', async () => {
    const { user } = setup({ route: '/gameday?week=2' });
    await screen.findByText('week 2 · final');
    expect(screen.getByRole('button', { name: 'week 2' })).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByRole('button', { name: 'week 3' }));
    await screen.findByText('week 3 · final');
    expect(screen.getByRole('button', { name: 'week 3' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'week 2' })).not.toHaveAttribute('aria-current');
    // the arrows step a week at a time
    await user.click(screen.getByRole('button', { name: 'previous week' }));
    await screen.findByText('week 2 · final');
    await user.click(screen.getByRole('button', { name: 'next week' }));
    await user.click(screen.getByRole('button', { name: 'next week' }));
    await screen.findByText('week 4 · final');
    await user.click(screen.getByRole('button', { name: 'week 5 (this week)' }));
    await waitFor(() => expect(screen.queryByText(/· final/, { selector: '.gd-status-line' })).not.toBeInTheDocument());
  });

  it('keeps the old ?week=last and clamps a week that has not happened', async () => {
    setup({ route: '/gameday?week=last' });
    await screen.findByText('week 4 · final');
    cleanup();
    setup({ route: '/gameday?week=40' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'week 5 (this week)' })).toHaveAttribute('aria-current', 'true'));
  });

  it('loads a past week’s finals from that week’s matchups', async () => {
    const { sleeper } = setup({ route: '/gameday?week=3', last: lastWeek });
    await screen.findByText('week 3 · final');
    // team 1 scored 18 + 12 + 9 = 39, team 2 12 + 8 + 7 = 27, from the matchups of week 3
    await waitFor(() => expect(board()).toHaveTextContent('39.0'));
    expect(board()).toHaveTextContent('27.0');
    expect(sleeper.liveMatchups).toHaveBeenCalledWith(expect.any(String), 3);
    expect(screen.getByRole('img', { name: /won/ })).toBeInTheDocument();
    // no live poll is needed for a finished week: the page only read it
    expect(sleeper.pastScores).toHaveBeenCalledWith(expect.any(String), 3);
  });

  it('keeps a past week once it has been read: coming back to it asks for nothing', async () => {
    const { sleeper, user } = setup({ route: '/gameday?week=3', last: lastWeek });
    await screen.findByText('week 3 · final');
    await waitFor(() => expect(board()).toHaveTextContent('39.0'));
    const asked = () => (sleeper.liveMatchups as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => c[1] === 3).length;
    expect(asked()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'week 4' }));
    await screen.findByText('week 4 · final');
    await user.click(screen.getByRole('button', { name: 'week 3' }));
    await waitFor(() => expect(screen.getByText('week 3 · final')).toBeInTheDocument());
    await waitFor(() => expect(board()).toHaveTextContent('39.0'));
    expect(asked()).toBe(1);
  });

  it('turns a past week into a week in review: the storylines, the standings and every other matchup final', async () => {
    const { user } = setup({ route: '/gameday?week=3', last: lastWeek });
    expect(await screen.findByRole('heading', { level: 2, name: 'week 3 in review' })).toBeInTheDocument();
    const stories = await screen.findByRole('list', { name: 'storylines' });
    expect(within(stories).getByText('highest score')).toBeInTheDocument();
    expect(within(stories).getByText(/has the highest score of the week\./)).toBeInTheDocument();
    expect(within(stories).getByText('player of the week')).toBeInTheDocument();
    // the other matchup is a card, final
    const card = screen.getByRole('button', { name: /open as the main event/ });
    expect(card).toHaveTextContent('final');
    // a story that is about a matchup opens it as the main event: the closest finish was the other one, by 2 points
    await user.click(within(stories).getByRole('button', { name: /closest finish/ }));
    expect(screen.getByRole('button', { name: 'back to my matchup' })).toBeInTheDocument();
  });

  it('shows head to head for your matchup in a past week, and drops the hinges tab', async () => {
    const { user } = setup({ route: '/gameday?week=3&tab=h2h', last: lastWeek });
    expect(await screen.findByRole('heading', { name: 'starters, head to head' })).toBeInTheDocument();
    const table = document.querySelector('.h2h') as HTMLElement;
    expect(within(table).getByText('Alex Arm')).toBeInTheDocument();
    expect(within(table).getByText('18.0')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'hinges on' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'the drive chart' }));
    // a finished week with no replay shows its top plays as markers and says how to watch it drive
    expect(await screen.findByText(/replay the week to watch it drive/)).toBeInTheDocument();
    expect(document.querySelectorAll('.dt-mark').length).toBeGreaterThan(0);
  });

  it('replays any past week, not just the last one', async () => {
    const { sleeper, user } = setup({ route: '/gameday?week=2', last: lastWeek });
    await user.click(await screen.findByRole('button', { name: 'replay week 2' }));
    const controls = await screen.findByRole('group', { name: 'replay controls' });
    expect(within(controls).getByText('replay · week 2')).toBeInTheDocument();
    expect(screen.getByText('replay · week 2', { selector: '.gd-status-line' })).toBeInTheDocument();
    // it needed that week's kickoff times, from the finished-week scores
    expect(sleeper.pastScores).toHaveBeenCalledWith(expect.any(String), 2);
    expect(screen.getByRole('button', { name: 'week 2' })).toHaveAttribute('aria-current', 'true');
    // picking another week stops it
    await user.click(screen.getByRole('button', { name: 'week 3' }));
    await screen.findByText('week 3 · final');
    expect(screen.queryByRole('group', { name: 'replay controls' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'replay week 3' })).toBeInTheDocument();
  });

  it('offers no replay for the week in progress', async () => {
    setup({ a: 'live' });
    await screen.findByRole('heading', { level: 2, name: 'the main event' });
    expect(screen.queryByRole('button', { name: /^replay week/ })).not.toBeInTheDocument();
  });
});

describe('game day: where they are on the field', () => {
  const meta = {
    possession: 'N1', yard_line: 44, yard_line_territory: 'N2', down: 2, down_and_distance: '2nd & 7', red_zone: '', away_used_timeouts: 1, home_used_timeouts: 0,
    home_score_quarter1: 7, home_score_quarter2: 10, away_score_quarter1: 3, away_score_quarter2: 7,
  };
  const pts = { t1qb: 10, t1rb: 5, t1wr: 6, t2qb: 4, t2rb: 3, t2wr: 2 };

  it('says which of your starters are on offense, with the down, the spot and the clock', async () => {
    setup({ pts, meta });
    const mine = (await screen.findAllByRole('heading', { level: 3, name: 'Sunday Scaries' }))[0]!.closest('.gd-team') as HTMLElement;
    // team 1 plays for N1, who have the ball: all three starters are on offense
    expect(within(mine).getAllByText('on offense')).toHaveLength(3);
    expect(within(mine).getAllByText('2nd & 7 · at n2 44')).toHaveLength(3);
    expect(within(mine).getAllByText('q2 7:30').length).toBeGreaterThan(0);
    // the other side plays for N2: not on the field
    const theirs = screen.getAllByRole('heading', { level: 3 }).find((h) => h.textContent === 'Reed Between the Lines')!.closest('.gd-team') as HTMLElement;
    expect(within(theirs).getAllByText('off the field')).toHaveLength(3);
  });

  it('draws a mini field for each live starter with the ball at the spot, labelled in words', async () => {
    setup({ pts, meta });
    const fields = await screen.findAllByRole('img', { name: 'n1 on offense, 2nd and 7 at the n2 44' });
    // six starters in the one live game
    expect(fields).toHaveLength(6);
    // N1 is the home team: it goes left; the ball is 44 yards from the visitor's goal line
    expect(fields[0]!).toHaveAttribute('data-dir', 'left');
    expect(fields[0]!.querySelector('.mf-ball')).toHaveStyle({ left: `${(54 / 120) * 100}%` });
    expect(fields[0]!.querySelectorAll('.art-turf-ez')).toHaveLength(2);
  });

  it('shows the timeouts left and opens the quarters', async () => {
    const { user } = setup({ pts, meta });
    const mine = (await screen.findAllByRole('heading', { level: 3, name: 'Sunday Scaries' }))[0]!.closest('.gd-team') as HTMLElement;
    // N2 used one of three, N1 none
    expect(within(mine).getAllByText('n2 2 timeouts left')[0]).toBeInTheDocument();
    expect(within(mine).getAllByText('n1 3 timeouts left')[0]).toBeInTheDocument();
    await user.click(within(mine).getAllByRole('button', { name: 'quarters' })[0]!);
    const t = within(mine).getByRole('table', { name: 'n2 at n1, points by quarter' });
    expect(within(t).getByRole('row', { name: /n2 3 7 10/ })).toBeInTheDocument();
    expect(within(t).getByRole('row', { name: /n1 7 10 17/ })).toBeInTheDocument();
  });

  it('shows the same situation under each starter in head to head', async () => {
    setup({ pts, meta, route: '/gameday?tab=h2h' });
    const table = (await screen.findByRole('heading', { name: 'starters, head to head' })).closest('section')!;
    await waitFor(() => expect(within(table).getAllByText('2nd & 7 · at n2 44').length).toBe(6));
    expect(within(table).getAllByText('on offense')).toHaveLength(3);
    expect(within(table).getAllByText('off the field')).toHaveLength(3);
  });

  it('shows halftime as a word, not a ball position', async () => {
    setup({ pts, meta: { ...meta, quarter: 'HALF', time_remaining: '00:00' } });
    const mine = (await screen.findAllByRole('heading', { level: 3, name: 'Sunday Scaries' }))[0]!.closest('.gd-team') as HTMLElement;
    await waitFor(() => expect(within(mine).getAllByText('halftime').length).toBeGreaterThan(0));
    expect(within(mine).queryByText('2nd & 7 · at n2 44')).not.toBeInTheDocument();
  });

  it('shows the score of a game that is over, under the starter', async () => {
    setup({ pts, a: 'final', b: 'final' });
    const mine = (await screen.findAllByRole('heading', { level: 3, name: 'Sunday Scaries' }))[0]!.closest('.gd-team') as HTMLElement;
    await waitFor(() => expect(within(mine).getAllByText(/n2 10, n1 17 · final/).length).toBe(3));
  });
});

describe('game day: around the league', () => {
  it('shows who is live on a card, both teams with their best starters, the chance and what is left', async () => {
    setup({ pts: { t3qb: 12, t3rb: 6, t3wr: 5, t4qb: 3 }, a: 'final', b: 'live' });
    const card = await screen.findByRole('button', { name: /open as the main event/ });
    expect(card).toHaveTextContent(/live: .+ on the field/);
    expect(card).toHaveTextContent(/\d+ live · \d+ on deck/);
    expect(card).toHaveTextContent(/proj \d+\.\d/);
    // two avatar stacks, two starters each
    expect(card.querySelectorAll('.avatar-stack')).toHaveLength(2);
    expect(card.querySelectorAll('.avatar-stack .avatar')).toHaveLength(4);
  });

  it('sorts the cards, and says how', async () => {
    setup({ a: 'live', b: 'live' });
    expect(await screen.findByRole('radiogroup', { name: 'sort matchups' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'live first' })).toBeChecked();
  });

  it('puts storylines above the cards', async () => {
    setup({ pts: { t1qb: 10, t1rb: 5, t1wr: 6, t2qb: 4, t2rb: 3, t2wr: 2, t3qb: 5, t3rb: 5, t3wr: 5, t4qb: 30, t4rb: 15, t4wr: 15 }, b: 'live' });
    const stories = await screen.findByRole('list', { name: 'storylines' });
    expect(within(stories).getByText('highest score')).toBeInTheDocument();
    expect(within(stories).getByText('60.0')).toBeInTheDocument();
    expect(within(stories).getByText('player of the week so far')).toBeInTheDocument();
    expect(stories.compareDocumentPosition(screen.getByRole('radiogroup', { name: 'sort matchups' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('game day: headshots', () => {
  const pts = { t1qb: 10, t1rb: 5, t1wr: 6, t2qb: 4, t2rb: 3, t2wr: 2, t3qb: 5, t3rb: 5, t3wr: 5, t4qb: 30, t4rb: 15, t4wr: 15 };
  const decorative = (root: ParentNode) => {
    for (const a of root.querySelectorAll('.avatar')) expect(a).toHaveAttribute('aria-hidden', 'true');
    for (const img of root.querySelectorAll('img.avatar-img')) expect(img).toHaveAttribute('alt', '');
  };

  it('puts a 28 px headshot on every starter row of the main event, the name staying the visible text', async () => {
    setup({ pts });
    await waitFor(() => expect(board()).toHaveTextContent('21.0'));
    const rows = [...document.querySelectorAll<HTMLElement>('.gd-row')];
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.querySelector('.gd-who > .avatar')).toHaveAttribute('data-size', '28');
      expect(row.querySelector('.gd-who-text .gd-pname')).not.toBeEmptyDOMElement();
    }
    expect(within(rows[0]!).getByText('Alex Arm')).toBeInTheDocument();
    decorative(document.querySelector('.gd-teams')!);
  });

  it('puts a 40 px headshot on each game ball, and a 28 px one on the player left on the sideline', async () => {
    const { user } = setup({ pts: { ...pts, t1bw: 22 } });
    await user.click(await screen.findByRole('radio', { name: 'game balls' }));
    await waitFor(() => expect(document.querySelector('.gd-balls')).not.toBeNull());
    const balls = document.querySelector<HTMLElement>('.gd-balls')!;
    const items = [...balls.querySelectorAll('li')];
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) expect(li.querySelector('.avatar')).toHaveAttribute('data-size', '40');
    decorative(balls);
    await user.click(screen.getByRole('radio', { name: 'left on the sideline' }));
    const row = (await screen.findByText('Sunday Scaries', { selector: '.gd-side-rows .gd-pname' })).closest('li')!;
    expect(row.querySelector('.avatar')).toHaveAttribute('data-size', '28');
    expect(row).toHaveTextContent('Backup Wideout sat for 22.0');
    decorative(row);
  });

  it('leads the player-of-the-week story with his 40 px headshot', async () => {
    setup({ pts, b: 'live' });
    const stories = await screen.findByRole('list', { name: 'storylines' });
    const story = within(stories).getByText('player of the week so far').closest('li')!;
    expect(story.querySelector('.avatar')).toHaveAttribute('data-size', '40');
    expect(story).toHaveTextContent(/scored the most for/);
    // a story about a matchup has no player to show
    const high = within(stories).getByText('highest score').closest('li')!;
    expect(high.querySelector('.avatar')).toBeNull();
    decorative(stories);
  });

  it('stacks the top starters of both teams on an around-the-league card, 28 px', async () => {
    setup({ pts: { t3qb: 12, t3rb: 6, t3wr: 5, t4qb: 3 }, a: 'final', b: 'live' });
    const card = await screen.findByRole('button', { name: /open as the main event/ });
    const stacks = card.querySelectorAll('.avatar-stack');
    expect(stacks).toHaveLength(2);
    for (const s of stacks) expect(s).toHaveAttribute('data-size', '28');
    decorative(card);
  });

  it('reads a play with the player’s 20 px headshot on the drive chart’s popover', async () => {
    const { state, user } = setup({ pts });
    await waitFor(() => expect(board()).toHaveTextContent('21.0'));
    state.pts = { ...pts, t1qb: 16.4 };
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(board()).toHaveTextContent('27.4'));
    await user.click(screen.getByRole('radio', { name: 'the drive chart' }));
    const field = await screen.findByRole('figure');
    const play = within(field).getByRole('button', { name: '+6.4 alex arm, n1 vs n2, q2 7:30' });
    expect(field.querySelector('.dt-tip')).toBeNull();
    await user.hover(play);
    const tip = field.querySelector('.dt-tip')!;
    expect(tip).toHaveTextContent('+6.4 · alex arm · n1 vs n2 · q2 7:30');
    expect(tip.querySelector('.avatar')).toHaveAttribute('data-size', '20');
    expect(tip).toHaveAttribute('aria-hidden', 'true');
    // the play's accessible name is unchanged: the avatar adds nothing a reader hears
    expect(play).toHaveAccessibleName('+6.4 alex arm, n1 vs n2, q2 7:30');
  });
});
