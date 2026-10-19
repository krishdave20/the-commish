import { cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { createFakeSleeper, liveSampleModel, sampleAccount, sampleLoadModel, sampleLiveProjections, sampleScores } from '../../../test/fakes';
import type { Matchup, ProjectionRow, Transaction } from '../../../data';
import { renderApp } from '../../../app/testUtils';
import { HeadToHeadBody, KeysList, LineupNotes, MovesBody, TendenciesBody, ThreatsBody } from './sections';
import { MY_LABELS, scoutLineup, tendencies } from '../../../engine/scouting';
import type { ScoutPlayer, ScoutTeam } from '../../../engine/scouting';

// the first render builds the whole model: give it room when the machine is busy (the full suite runs many files at once)
configure({ asyncUtilTimeout: 6000 });
vi.setConfig({ testTimeout: 20_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const linked = [sampleAccount()];
const MIN = 60_000;

/* The sample league (4 teams, 3 slots) with a bench for the team across from me: Bench Bo (a 16-point wideout) sits behind Reed Receiver (13),
   and Ray Rusher, their running back, is questionable. Matchup 1 is me against rid 2, matchup 2 is rid 3 against rid 4. */
function model() {
  const m = liveSampleModel();
  const wr = m.players.find((p) => p.pid === 't2wr')!;
  m.players.push({ ...wr, pid: 't2bw', name: 'Bench Bo', mu: { ...wr.mu, 5: 16, 6: 16 }, hi: { ...wr.hi, 5: 24 }, lo: { ...wr.lo, 5: 8 } });
  m.players.find((p) => p.pid === 't2rb')!.injury = 'Questionable';
  return m;
}

function matchups(week: number): Matchup[] {
  const pts = week === 5
    ? {}
    : { t1qb: 18, t1rb: 12, t1wr: 9, t2qb: 12, t2rb: 8, t2wr: 7, t2bw: 20, t3qb: 14, t3rb: 6, t3wr: 5, t4qb: 9, t4rb: 9, t4wr: 9 } as Record<string, number>;
  const rows: Array<[number, number, string[], string[]]> = [
    [1, 1, ['t1qb', 't1rb', 't1wr'], ['t1bw']], [2, 1, ['t2qb', 't2rb', 't2wr'], ['t2bw']], [3, 2, ['t3qb', 't3rb', 't3wr'], []], [4, 2, ['t4qb', 't4rb', 't4wr'], []],
  ];
  return rows.map(([rid, matchup_id, starters, bench]) => {
    const players = [...starters, ...bench];
    const players_points = Object.fromEntries(players.map((p) => [p, (pts as Record<string, number>)[p] ?? 0]));
    const starters_points = starters.map((p) => players_points[p]!);
    return { roster_id: rid, matchup_id, points: starters_points.reduce((a, b) => a + b, 0), starters, players, starters_points, players_points, custom_points: null } as Matchup;
  });
}

function projections(): ProjectionRow[] {
  return [...sampleLiveProjections(), { player_id: 't2bw', stats: { pts_ppr: 16 }, player: { position: 'WR', first_name: 'Bench', last_name: 'Bo' } }];
}

const loaded = <T,>(data: T) => ({ data, asOf: 1, fromCache: false, stale: false, bytes: 1, ms: 1, status: 200 });
const tx = (o: Partial<Transaction> & { transaction_id: string; type: string }): Transaction =>
  ({ status: 'complete', leg: 5, created: 1792000000000, status_updated: 1792000000000, adds: null, drops: null, roster_ids: [2], ...o });

function setup(route: string, transactions: Transaction[] = []) {
  const sleeper = createFakeSleeper({
    live: {
      matchups, projections,
      scores: (w) => (w === 5 ? sampleScores({ a: 'pre', b: 'pre', kickoff: Date.now() + 5 * MIN }) : sampleScores({ a: 'final', b: 'final', kickoff: Date.now() - 8 * 86_400_000 })),
    },
  });
  Object.assign(sleeper, { transactions: vi.fn(async () => loaded(transactions)) });
  return renderApp({ linked, route, sleeper, loadModel: sampleLoadModel(model) });
}

describe('scouting: my matchup', () => {
  it('answers first: their projection, their lineup grade and their biggest threat', async () => {
    setup('/gameday?tab=scout');
    const strip = await screen.findByRole('group', { name: 'scouting Reed Between the Lines' });
    // 19 + 14 × 0.85 (questionable) + 13 = 43.9, against my 20 + 15 + 12 = 47.0
    expect(strip).toHaveTextContent('their projection');
    expect(strip).toHaveTextContent('43.9');
    expect(strip).toHaveTextContent('vs your 47.0');
    // Bench Bo (16.0) over Reed Receiver (13.0): 3.0 left on the bench
    expect(strip).toHaveTextContent('−3.0');
    expect(strip).toHaveTextContent('points left on the bench');
    expect(strip).toHaveTextContent('biggest threat');
    expect(within(strip).getByRole('link', { name: /Quinn Quarterback|Ray Rusher|Reed Receiver/ })).toBeInTheDocument();
  });

  it('flags the sub-optimal starter and the questionable one in their lineup, with headshots', async () => {
    setup('/gameday?tab=scout');
    const card = (await screen.findByRole('heading', { level: 2, name: 'their lineup' })).closest('section')!;
    expect(within(card).getByText('they’re starting Reed Receiver over Bench Bo (−3.0 proj)')).toBeInTheDocument();
    expect(within(card).getByText('they’re starting a questionable rb: Ray Rusher')).toBeInTheDocument();
    expect(card).toHaveTextContent('projected 43.9 · best lineup 46.9');
    // a headshot of the player each flag is about (decorative)
    expect(card.querySelectorAll('.avatar').length).toBe(2);
    for (const img of card.querySelectorAll('img.avatar-img')) expect(img).toHaveAttribute('alt', '');
  });

  it('gives the keys to beating them, with numbers', async () => {
    setup('/gameday?tab=scout');
    const card = (await screen.findByRole('heading', { level: 2, name: 'how to beat them' })).closest('section')!;
    const keys = within(card).getAllByRole('listitem');
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys.length).toBeLessThanOrEqual(3);
    // rb: my 15.0 against their 11.9
    expect(keys[0]).toHaveTextContent('your rb vs their rb is the swing slot: projected +3.1 for you');
    // the heaviest three: the swing slot, the starter their week rides on, and the questionable back with no healthy bench back behind him
    expect(within(card).getByText('Ray Rusher is questionable (11.9 proj): their bench has no healthy rb to cover him')).toBeInTheDocument();
    expect(keys.map((k) => k.textContent).join(' ')).toMatch(/carries their week: \d+ points of win chance ride on him/);
  });

  it('keeps the rest behind disclosures: the bench, hinges, season tendencies, recent moves and head to head', async () => {
    setup('/gameday?tab=scout', [tx({ transaction_id: 'w1', type: 'waiver', adds: { t2bw: 2 }, settings: { waiver_bid: 12 } }), tx({ transaction_id: 'x', type: 'free_agent', roster_ids: [9], adds: { t1bw: 9 } })]);
    await screen.findByRole('heading', { level: 2, name: 'their lineup' });
    const names = ['bench threat', 'their hinges', 'season tendencies', 'recent moves', 'head to head this season'];
    for (const n of names) {
      const summary = screen.getByRole('heading', { level: 3, name: n }).closest('summary')!;
      expect(summary.closest('details')).not.toHaveAttribute('open');
    }
    // the moves: their waiver claim, with the bid and the projection; the other team's pickup is not theirs
    await waitFor(() => expect(screen.getByText(/added Bench Bo \(wr, 16\.0 proj\) for \$12/)).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 3, name: 'recent moves' }).closest('summary')).toHaveTextContent('1 in 2 weeks');
    // hinges: their starters ranked by win chance at stake
    const hinges = screen.getByRole('heading', { level: 3, name: 'their hinges' }).closest('details')!;
    expect(hinges).toHaveTextContent(/their win chance now is \d+%/);
    expect(within(hinges).getAllByRole('listitem').length).toBe(3);
  });

  it('reads the season: left on the bench, over and underperformer, boom and bust, close games, and the meetings so far', async () => {
    setup('/gameday?tab=scout');
    await screen.findByRole('heading', { level: 3, name: 'season tendencies' });
    // weeks 1 to 4: Bench Bo scored 20 against the 7 of the wideout who started: 13.0 left every week; they scored 27 against 46 projected
    await waitFor(() => expect(screen.getByText('leaves 13.0 points on the bench a week, best lineup in 0 of 4 weeks')).toBeInTheDocument());
    expect(screen.getByText('underperformer: 19.0 points below projection a week over 4 weeks')).toBeInTheDocument();
    expect(screen.getByText(/^averages 111\.5, from 107\.0 \(week 1\) to 115\.0 \(week 3\)/)).toBeInTheDocument();
    // margins: 0, 0, +3 and 0: four close games, one win, three ties
    expect(screen.getByText('1–0–3 in games decided by 10 or fewer')).toBeInTheDocument();
    // the two meetings this season were both ties on the schedule
    expect(screen.getByText('week 1: you tied 107.0–107.0')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'head to head this season' }).closest('summary')).toHaveTextContent('0–0–2 so far this season');
  });
});

describe('scouting: another matchup', () => {
  it('scouts either team of any matchup picked in around the league, with team names in the keys', async () => {
    const { user } = setup('/gameday?tab=scout&m=2');
    const group = await screen.findByRole('group', { name: 'scouting Fourth and Long' });
    expect(group).toHaveTextContent('their projection');
    // 17 + 13 + 10 = 40 against 15 + 10 + 8 = 33
    expect(group).toHaveTextContent('40.0');
    expect(group).toHaveTextContent('vs Hail Mary Club’s 33.0');
    expect(screen.getByRole('radiogroup', { name: 'team to scout' })).toBeInTheDocument();
    // the keys talk about the two teams, not "you"
    const keys = (await screen.findByRole('heading', { level: 2, name: 'how to beat them' })).closest('section')!;
    expect(keys).toHaveTextContent('Hail Mary Club’s rb vs Fourth and Long’s rb is the swing slot: projected +3.0 for Fourth and Long');

    await user.click(screen.getByRole('radio', { name: 'Hail Mary Club' }));
    expect(await screen.findByRole('group', { name: 'scouting Hail Mary Club' })).toHaveTextContent('33.0');
    expect(screen.getByRole('heading', { level: 2, name: 'how to beat them' }).closest('section')).toHaveTextContent('Fourth and Long’s rb vs Hail Mary Club’s rb is the swing slot: projected +3.0 for Fourth and Long');
    // no meeting between them and me to quote: the head to head is about the two teams in this matchup
    expect(screen.getByRole('heading', { level: 3, name: 'head to head this season' })).toBeInTheDocument();
  });
});

describe('scouting: a finished week', () => {
  it('reads points instead of projections, drops the keys and the hinges, and names who sat while he scored', async () => {
    setup('/gameday?tab=scout&week=4');
    const strip = await screen.findByRole('group', { name: 'scouting Reed Between the Lines' });
    await waitFor(() => expect(strip).toHaveTextContent('their score'));
    expect(strip).toHaveTextContent('27.0');
    expect(strip).toHaveTextContent('top scorer');
    expect(strip).toHaveTextContent('−13.0');
    expect(screen.getByText('they started Reed Receiver over Bench Bo (−13.0 pts)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'their lineup' }).closest('section')).toHaveTextContent('scored 27.0 · best lineup 40.0');
    expect(screen.queryByRole('heading', { name: 'how to beat them' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'their hinges' })).not.toBeInTheDocument();
    expect(screen.getByText('week 4 in review')).toBeInTheDocument();
    // only weeks before it are in the tendencies: 3 of them
    await waitFor(() => expect(screen.getByText('leaves 13.0 points on the bench a week, best lineup in 0 of 3 weeks')).toBeInTheDocument());
  });
});

/* ---------- the pieces, on hand-built data ---------- */

const P = (pid: string, pos: string, mu: number, o: Partial<ScoutPlayer> = {}): ScoutPlayer =>
  ({ pid, name: pid, pos, nfl: 'AAA', state: 'pre', actual: 0, mu, projection: mu, kickoff: 1, injury: '', ceiling: null, bye: false, ...o });
const wrap = (node: React.ReactElement) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('the scouting pieces', () => {
  const t: ScoutTeam = { rid: 2, name: 'them', manager: 'x', isMe: false, slots: ['QB', 'WR'], starters: [P('q', 'QB', 20), P('w', 'WR', 7)], bench: [P('b', 'WR', 9)], actual: 0 };

  it('says the lineup is fine when there is nothing to flag, and says what is wrong when there is', () => {
    const ok = scoutLineup({ ...t, starters: [P('q', 'QB', 20), P('w', 'WR', 10)] }, { review: false });
    const { unmount } = wrap(<LineupNotes notes={ok.notes} review={false} optimal={ok.isOptimal} />);
    expect(screen.getByText(/nothing to fix/)).toBeInTheDocument();
    unmount();
    const bad = scoutLineup(t, { review: false });
    wrap(<LineupNotes notes={bad.notes} review={false} optimal={bad.isOptimal} />);
    expect(screen.getByText('they’re starting w over b (−2.0 proj)')).toBeInTheDocument();
    expect(screen.getByText('+2.0')).toBeInTheDocument();
  });

  it('lists keys numbered, threats, tendencies, moves and meetings, and has a sentence for each empty case', () => {
    const { unmount } = wrap(<><KeysList keys={[{ kind: 'swing', text: 'a key', weight: 1, number: 1, player: null }]} /><ThreatsBody threats={[]} review={false} /><TendenciesBody t={tendencies({ rid: 2, week: 1, past: [], history: [] })} loading={false} /><MovesBody moves={[]} loading={false} /><HeadToHeadBody h={{ meetings: [], wins: 0, losses: 0, ties: 0, summary: 'none' }} labels={MY_LABELS} /></>);
    expect(screen.getByText('a key')).toBeInTheDocument();
    expect(screen.getByText(/no healthy bench player is within 3\.0/)).toBeInTheDocument();
    expect(screen.getByText(/no finished weeks yet/)).toBeInTheDocument();
    expect(screen.getByText(/no adds, drops or trades in the last two weeks/)).toBeInTheDocument();
    expect(screen.getByText('you and them have not met yet this season.')).toBeInTheDocument();
    unmount();
  });
});
