import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeSleeper, liveSampleModel, nflScoreGame, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, samplePlayersFile,
} from '../../test/fakes';
import type { PlayersMap, ScoreGame, WeekStats } from '../../data';
import { renderApp } from '../../app/testUtils';
import { formatKickoff } from '../../app/live/format';
import { TEAM_COLORS, timeSlot } from '../../engine/nfl';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const linked = [sampleAccount()];
const D = 86_400_000;
const SUN = Date.parse('2026-09-13T17:00:00Z');

/** N1 (the home team) has the ball on the N2 44: 2nd and 7. */
const withBall = (g: ScoreGame): ScoreGame => ({
  ...g, metadata: { ...g.metadata, possession: 'N1', yard_line: 44, yard_line_territory: 'N2', down: 2, down_and_distance: '2nd & 7', red_zone: '', away_used_timeouts: 1, home_used_timeouts: 3 },
});

/** Weeks 1 to 4 are over (real team codes, so the standings have something to count); week 5 is on: one live game and one final between the
    sample league's pretend NFL teams (N1 to N4: every player of fantasy team k plays for N{k}), and a real kickoff three days away. */
function scoresFor(week: number, o: { homeLive: number; kickoff: number }): ScoreGame[] {
  switch (week) {
    case 1: return [nflScoreGame({ id: 'w1', away: 'BUF', home: 'MIA', kickoff: SUN, q: [[7, 7, 7, 3], [3, 7, 0, 7]] })];
    case 2: return [nflScoreGame({ id: 'w2', away: 'MIA', home: 'NE', kickoff: SUN + 7 * D, q: [[10, 10, 0, 0], [10, 0, 10, 0]] })];
    case 3: return [nflScoreGame({ id: 'w3', away: 'BUF', home: 'KC', kickoff: SUN + 14 * D, q: [[0, 3, 7, 0], [7, 10, 6, 7]] })];
    case 4: return [nflScoreGame({ id: 'w4', away: 'CHI', home: 'DET', kickoff: SUN + 21 * D, q: [[7, 7, 7, 0], [7, 0, 7, 0]] })];
    case 5: return [
      withBall(nflScoreGame({ id: 'g1', away: 'N2', home: 'N1', state: 'live', kickoff: o.kickoff, score: [10, o.homeLive], q: [[3, 7], [7, o.homeLive - 7]], channel: 'CBS' })),
      nflScoreGame({ id: 'g2', away: 'N4', home: 'N3', state: 'final', kickoff: o.kickoff + 60_000, q: [[0, 7, 7, 0], [7, 7, 0, 3]] }),
      nflScoreGame({ id: 'g3', away: 'KC', home: 'LAC', state: 'pre', kickoff: Date.now() + 3 * D }),
    ];
    default: return [];
  }
}

const line = (o: Record<string, number>) => ({ gp: 1, ...o });
function statsFor(week: number): WeekStats {
  switch (week) {
    case 1: return { qbA: line({ pass_cmp: 20, pass_att: 30, pass_yd: 300, pass_td: 2 }), qbB: line({ pass_cmp: 18, pass_att: 28, pass_yd: 300, pass_td: 1, pass_int: 1 }), TEAM_KC: line({ pass_yd: 999 }), rbA: line({ rush_att: 20, rush_yd: 110, rush_td: 1 }) };
    case 3: return { qbA: line({ pass_cmp: 10, pass_att: 15, pass_yd: 100 }), rbA: line({ rush_att: 10, rush_yd: 40 }), rbB: line({ rush_att: 12, rush_yd: 150 }) };
    case 5: return {
      qbB: line({ pass_cmp: 5, pass_att: 9, pass_yd: 150 }), qbN1: line({ pass_cmp: 20, pass_att: 30, pass_yd: 250, pass_td: 2 }),
      rbN2: line({ rush_att: 15, rush_yd: 70, rush_td: 1 }), wrN1: line({ rec: 7, rec_tgt: 9, rec_yd: 91, rec_td: 1 }),
      fa1: line({ pts_ppr: 14.2, rec: 6, rec_tgt: 8, rec_yd: 80 }),
    };
    default: return {};
  }
}

const rec = (id: string, first: string, last: string, position: string, team: string) => ({ player_id: id, first_name: first, last_name: last, position, team, status: 'Active', active: true });
const playersFile = (): PlayersMap => ({
  ...samplePlayersFile(),
  qbA: rec('qbA', 'Quinn', 'Aaron', 'QB', 'KC'), qbB: rec('qbB', 'Pat', 'Bishop', 'QB', 'LAC'),
  rbA: rec('rbA', 'Rex', 'Allen', 'RB', 'KC'), rbB: rec('rbB', 'Rob', 'Bell', 'RB', 'DEN'),
  qbN1: rec('qbN1', 'Bo', 'Leader', 'QB', 'N1'), rbN2: rec('rbN2', 'Ray', 'Second', 'RB', 'N2'), wrN1: rec('wrN1', 'Wes', 'Catch', 'WR', 'N1'),
  fa1: rec('fa1', 'Free Agent', 'Fran', 'WR', 'N1'),
} as unknown as PlayersMap);

interface Setup { route?: string; pts?: Record<string, number> }

function setup(o: Setup = {}) {
  const kickoff = Date.now() - 3_600_000;
  const state = { homeLive: 17, pts: o.pts ?? { t1qb: 10, t1rb: 5, t1wr: 6, t2qb: 4, t3qb: 5, t4qb: 9 } };
  const sleeper = createFakeSleeper({
    live: {
      matchups: () => sampleLiveMatchups(state.pts),
      scores: (w) => scoresFor(w, { homeLive: state.homeLive, kickoff }),
      projections: () => sampleLiveProjections(),
      stats: statsFor,
    },
    playersFile: playersFile(),
  });
  const utils = renderApp({ linked, route: o.route ?? '/nfl', sleeper, loadModel: sampleLoadModel(liveSampleModel) });
  return { state, kickoff, ...utils };
}

/** the card of a game, found by the letters of its two teams */
const card = async (away: string, home: string) => {
  const cards = await screen.findAllByRole('button', { name: /open game details/ });
  const hit = cards.find((c) => c.textContent?.includes(away) && c.textContent?.includes(home));
  if (!hit) throw new Error(`no card for ${away} at ${home}`);
  return hit;
};

describe('the nfl page: scoreboard', () => {
  it('shows a card per game in its state: kicked off, live with the clock, and final', async () => {
    const { kickoff } = setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'nfl' })).toBeInTheDocument();
    const live = await card('N2', 'N1');
    expect(live).toHaveTextContent('q2 7:30');
    expect(live).toHaveTextContent('N1');
    expect(live).toHaveTextContent('17');
    expect(live).toHaveTextContent('CBS');
    expect(live.querySelector('.live-dot')).not.toBeNull();
    // the progress bar: game time elapsed (q2 7:30 is 0.375 of regulation)
    expect(live.querySelector('.nf-bar > i')).toHaveStyle({ width: '38%' });
    const final = await card('N4', 'N3');
    expect(final).toHaveTextContent('final');
    expect(final.querySelector('.live-dot')).toBeNull();
    expect(final.querySelector('.nf-bar > i')).toHaveStyle({ width: '100%' });
    expect(final).toHaveTextContent('17'); // N3 7+7+0+3
    const pre = await card('KC', 'LAC');
    expect(pre).toHaveTextContent(new RegExp(formatKickoff(Date.now() + 3 * D).split(' ')[0]!));
    expect(pre).toHaveTextContent('Kansas City');
    expect(pre.querySelector('.nf-bar > i')).toHaveStyle({ width: '0%' });
    // the live game's slot, named in eastern time
    expect(screen.getByRole('heading', { level: 3, name: timeSlot(kickoff).label })).toBeInTheDocument();
  });

  it('shows where the ball is on a live card: the down, the spot, a mini field and the timeouts, and nothing on the others', async () => {
    setup();
    const live = await card('N2', 'N1');
    expect(live).toHaveTextContent('2nd & 7 · at n2 44');
    // the field is decorative inside the button; its sentence is part of the card's name, and the timeouts are read out
    expect(live.querySelector('.mf')).toHaveAttribute('aria-hidden', 'true');
    expect(live).toHaveTextContent('n1 on offense, 2nd and 7 at the n2 44');
    expect(live).toHaveTextContent('n2 2 timeouts left');
    expect(live).toHaveTextContent('n1 0 timeouts left');
    // N1 is at home, so it goes left, and the ball is 44 yards from the visitor's goal line
    expect(live.querySelector('.mf')).toHaveAttribute('data-dir', 'left');
    expect(live.querySelector('.mf-ball')).toHaveStyle({ left: `${(54 / 120) * 100}%` });
    expect(live.querySelectorAll('.art-turf-ez')).toHaveLength(2);
    // the card is still one button: nothing inside it can be pressed
    expect(live.querySelectorAll('button')).toHaveLength(0);
    expect((await card('N4', 'N3')).querySelector('.mf')).toBeNull();
    expect((await card('KC', 'LAC')).querySelector('.mf')).toBeNull();
  });

  it('answers first: games live now, your players playing now, and the next kickoff', async () => {
    setup();
    const strip = await screen.findByRole('group', { name: 'week 5 at a glance' });
    await waitFor(() => expect(within(strip).getByText('games live now').closest('.kpi')).toHaveTextContent('1'));
    // my three starters play for N1, whose game is on
    expect(within(strip).getByText('your players playing now').closest('.kpi')).toHaveTextContent('3');
    expect(within(strip).getByText('next kickoff').closest('.kpi')).toHaveTextContent('Kansas City at Los Angeles');
    // and the live game says which of my starters are in it
    expect(await card('N2', 'N1')).toHaveTextContent('3 of your starters');
  });

  it('takes a live update from the shared poller (no second poller)', async () => {
    const { state, sleeper, user } = setup();
    const live = await card('N2', 'N1');
    expect(live).toHaveTextContent('17');
    await waitFor(() => expect((sleeper.scores as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    state.homeLive = 24;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(async () => expect(await card('N2', 'N1')).toHaveTextContent('24'));
  });

  it('switches week from the picker and comes back to this week', async () => {
    const { user } = setup();
    await card('N2', 'N1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'week' }), '3');
    const old = await card('BUF', 'KC');
    expect(old).toHaveTextContent('10');
    expect(old).toHaveTextContent('30');
    expect(old).toHaveTextContent('final');
    expect(screen.getByRole('group', { name: 'week 3 at a glance' })).toBeInTheDocument();
    // past weeks have no live games; stepping goes to the next week
    await user.click(screen.getByRole('button', { name: 'next week' }));
    expect(await card('CHI', 'DET')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'this week' }));
    expect(await card('N2', 'N1')).toBeInTheDocument();
  });
});

describe('the game drawer', () => {
  it('opens from a card with the score, the quarters, the team leaders, and the fantasy mix below a divider', async () => {
    const { user } = setup();
    await user.click(await card('N2', 'N1'));
    const dlg = await screen.findByRole('dialog', { name: /N2 at N1/i });
    expect(within(dlg).getByText(/week 5/)).toBeInTheDocument();
    // by quarter: the quarters add up to the score on the board
    const q = within(dlg).getByRole('table', { name: 'points by quarter' });
    expect(within(q).getByRole('row', { name: /N2 3 7 10/ })).toBeInTheDocument();
    expect(within(q).getByRole('row', { name: /N1 7 10 17/ })).toBeInTheDocument();
    // team leaders, from the week's stat lines filtered to the two teams
    const leaders = await within(dlg).findByRole('heading', { name: 'team leaders' });
    const box = leaders.closest('section')!;
    await within(box).findByText('Bo Leader');
    expect(box).toHaveTextContent('20/30, 250 yds, 2 tds');
    expect(box).toHaveTextContent('Ray Second');
    expect(box).toHaveTextContent('15 att, 70 yds, 1 td');
    expect(box).toHaveTextContent('Wes Catch');
    expect(box).toHaveTextContent('7/9 rec, 91 yds, 1 td');
    // the fantasy sections sit after a divider
    expect(dlg.querySelector('hr.nf-divider')).not.toBeNull();
    expect(within(dlg).getByText('fantasy · your league')).toBeInTheDocument();
  });

  it('shows the live field in the drawer of a live game, and not in a finished one', async () => {
    const { user } = setup();
    await user.click(await card('N2', 'N1'));
    const dlg = await screen.findByRole('dialog', { name: /N2 at N1/i });
    expect(within(dlg).getByRole('img', { name: 'n1 on offense, 2nd and 7 at the n2 44' })).toBeInTheDocument();
    expect(within(dlg).getByText('2nd & 7 · at n2 44')).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: /close/i }));
    await user.click(await card('N4', 'N3'));
    const done = await screen.findByRole('dialog', { name: /N4 at N3/i });
    expect(within(done).queryByRole('img', { name: /on offense/ })).toBeNull();
  });

  it('lists your players with points and projection, the rest of the league with their owners, top scores and the waiver wire', async () => {
    const { user } = setup();
    await user.click(await card('N2', 'N1'));
    const dlg = await screen.findByRole('dialog');
    // your players is the first tab when you have any
    const mine = await within(dlg).findByRole('list', { name: 'your players in this game' });
    const alex = within(mine).getByText('Alex Arm').closest('li')!;
    expect(alex).toHaveTextContent('you');
    expect(alex).toHaveTextContent('10.0');
    expect(alex).toHaveTextContent('proj');
    // the bench wideout is rostered by me too
    expect(within(mine).getByText('Backup Wideout')).toBeInTheDocument();
    await user.click(within(dlg).getByRole('radio', { name: /your league/ }));
    const league = await within(dlg).findByRole('list', { name: 'your league in this game' });
    expect(within(league).getByText('Quinn Quarterback').closest('li')).toHaveTextContent('Reed Between the Lines');
    await user.click(within(dlg).getByRole('radio', { name: 'top performers' }));
    const top = await within(dlg).findByRole('list', { name: 'top performers' });
    expect(within(top).getAllByRole('listitem')[0]).toHaveTextContent('Free Agent Fran'); // 14.2 from the stat line beats 10.0
    await user.click(within(dlg).getByRole('radio', { name: 'waiver watch' }));
    const wire = await within(dlg).findByRole('list', { name: 'waiver watch' });
    expect(wire).toHaveTextContent('Free Agent Fran');
    expect(wire).toHaveTextContent('free agent');
    expect(wire).toHaveTextContent('14.2');
  });

  it('opens straight from /nfl?game=<id> and closes back to the scoreboard', async () => {
    const { user } = setup({ route: '/nfl?game=g2' });
    const dlg = await screen.findByRole('dialog', { name: /N4 at N3/i });
    expect(within(dlg).getByText('final', { selector: '.nf-status' })).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens from a ticker game link', async () => {
    const { user } = setup({ route: '/takes' });
    const bar = await screen.findByRole('region', { name: 'league scores' });
    await user.click(within(bar).getAllByRole('link').find((a) => a.getAttribute('href') === '/nfl?game=g1')!);
    expect(await screen.findByRole('dialog', { name: /N2 at N1/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'nfl' })).toBeInTheDocument();
  });
});

describe('standings and the playoff picture', () => {
  it('shows the four division tables of a conference with the default columns, and more behind the toggle', async () => {
    const { user } = setup({ route: '/nfl?tab=standings' });
    const east = await screen.findByRole('table', { name: 'AFC East standings' });
    const rows = within(east).getAllByRole('row').slice(1).map((r) => r.textContent);
    // Buffalo 1-1 leads the division; New England (a tie) and Miami (a tie and a loss) follow, and New York has no games
    expect(rows[0]).toMatch(/BUF.*1-1.*\.500.*-13/);
    expect(rows[1]).toMatch(/NE.*0-0-1.*\.500/);
    expect(rows[2]).toMatch(/MIA.*0-1-1.*\.250/);
    expect(rows[3]).toMatch(/NYJ.*0-0.*—/);
    expect(screen.getAllByRole('table')).toHaveLength(4);
    expect(within(east).queryByRole('columnheader', { name: 'pf' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more columns/ }));
    expect(within(east).getByRole('columnheader', { name: 'pf' })).toBeInTheDocument();
    expect(within(east).getByRole('columnheader', { name: 'strk' })).toBeInTheDocument();
  });

  it('switches conference, and says the tiebreakers are simplified', async () => {
    const { user } = setup({ route: '/nfl?tab=standings' });
    await screen.findByRole('table', { name: 'AFC East standings' });
    await user.click(screen.getByRole('radio', { name: 'nfc' }));
    const north = await screen.findByRole('table', { name: 'NFC North standings' });
    expect(within(north).getAllByRole('row')[1]).toHaveTextContent('CHI');
    expect(screen.queryByRole('table', { name: 'AFC East standings' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'about nfc standings' }));
    expect(screen.getByText(/simplified tiebreakers; official nfl tiebreakers include more steps/)).toBeVisible();
  });

  it('seeds a conference "if the season ended today": division leaders first, then wild cards', async () => {
    setup({ route: '/nfl?tab=picture' });
    const table = await screen.findByRole('table', { name: /AFC playoff picture/ });
    expect(screen.getByText('if the season ended today')).toBeInTheDocument();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(/1.*KC.*1-0.*west leader/);
    expect(rows[1]).toHaveTextContent(/2.*BUF.*1-1.*east leader/);
    expect(rows.filter((r) => /leader/.test(r.textContent ?? ''))).toHaveLength(4);
    expect(rows.filter((r) => /wild card/.test(r.textContent ?? ''))).toHaveLength(3);
    expect(rows).toHaveLength(10);
  });
});

describe('the stats tab', () => {
  it('ranks league leaders over the season, with shared ranks for ties, and more columns behind the toggle', async () => {
    const { user } = setup({ route: '/nfl?tab=stats' });
    const table = await screen.findByRole('table', { name: /passing leaders by yds, weeks 1 to 5/ });
    const rows = within(table).getAllByRole('row').slice(1);
    // Quinn: 300 + 100, Pat: 300 + 150
    expect(rows[0]).toHaveTextContent(/1.*Pat Bishop.*LAC.*2.*450/);
    expect(rows[1]).toHaveTextContent(/2.*Quinn Aaron.*KC.*2.*400/);
    // the team-total row is not a player
    expect(table).not.toHaveTextContent('999');
    await user.click(screen.getByRole('button', { name: /more columns/ }));
    expect(within(table).getByRole('columnheader', { name: 'cmp %' })).toBeInTheDocument();
    // ranked by touchdowns: Quinn has 2, Pat has 1
    await user.click(screen.getByRole('radio', { name: 'td' }));
    const byTd = await screen.findByRole('table', { name: /passing leaders by td/ });
    expect(within(byTd).getAllByRole('row')[1]).toHaveTextContent('Quinn Aaron');
  });

  it('switches category and between the season and the latest week', async () => {
    const { user } = setup({ route: '/nfl?tab=stats' });
    await screen.findByRole('table', { name: /passing leaders/ });
    await user.click(screen.getByRole('radio', { name: 'rushing' }));
    const rush = await screen.findByRole('table', { name: /rushing leaders by yds, weeks 1 to 5/ });
    // Rex (110 + 40) and Rob (150) are level on yards: they share rank 1 (t1), and the name orders them
    expect(within(rush).getAllByRole('row')[1]).toHaveTextContent(/t1.*Rex Allen.*2.*150/);
    expect(within(rush).getAllByRole('row')[2]).toHaveTextContent(/t1.*Rob Bell.*1.*150/);
    await user.click(screen.getByRole('radio', { name: 'week 5' }));
    const wk = await screen.findByRole('table', { name: /rushing leaders by yds, week 5/ });
    expect(within(wk).getAllByRole('row')).toHaveLength(2);
    expect(within(wk).getAllByRole('row')[1]).toHaveTextContent(/Ray Second.*70/);
    await user.click(screen.getByRole('radio', { name: 'defense' }));
    expect(await screen.findByText(/no defense stats for week 5 yet/)).toBeInTheDocument();
  });

  it('lists team scoring from the season’s results, sortable', async () => {
    const { user } = setup({ route: '/nfl?tab=stats&view=teams' });
    const table = await screen.findByRole('table', { name: 'nfl team scoring' });
    const first = within(table).getAllByRole('row')[1]!;
    // KC scored 30 in its one game
    expect(first).toHaveTextContent(/KC.*30\.0.*10\.0.*\+20\.0/);
    // numbers sort high to low first: Buffalo allowed the most (23.5 a game); a second click puts Kansas City (10.0) first
    await user.click(within(table).getByRole('button', { name: /allowed\/g/ }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(/BUF.*23\.5/);
    await user.click(within(table).getByRole('button', { name: /allowed\/g/ }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(/KC.*10\.0/);
    expect(screen.getByText('stats: sleeper public api.')).toBeInTheDocument();
  });
});

describe('nfl only', () => {
  it('hides every fantasy overlay, and remembers the choice', async () => {
    const { user, unmount } = setup();
    expect(await card('N2', 'N1')).toHaveTextContent('3 of your starters');
    const strip = screen.getByRole('group', { name: 'week 5 at a glance' });
    expect(within(strip).getByText('your players playing now')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'nfl only' }));
    expect(screen.getByRole('button', { name: 'nfl only' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('wr.nfl.only.v1')).toBe('on');
    expect(screen.queryByText(/of your starters/)).not.toBeInTheDocument();
    expect(within(strip).queryByText('your players playing now')).not.toBeInTheDocument();
    expect(within(strip).getByText('games final')).toBeInTheDocument();
    // the drawer is the pure box score: no owners, no fantasy tabs
    await user.click(await card('N2', 'N1'));
    const dlg = await screen.findByRole('dialog');
    await within(dlg).findByRole('heading', { name: 'team leaders' });
    expect(within(dlg).queryByText('fantasy · your league')).not.toBeInTheDocument();
    expect(within(dlg).queryByRole('radio', { name: /your league/ })).not.toBeInTheDocument();
    expect(within(dlg).queryByText('waiver watch')).not.toBeInTheDocument();
    // standings drop the "your players" column
    await user.click(within(dlg).getByRole('button', { name: 'Close' }));
    unmount();
    cleanup();
    // a new visit starts with it on
    setup({ route: '/nfl?tab=standings' });
    expect(await screen.findByRole('button', { name: 'nfl only' })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByRole('table', { name: 'AFC East standings' });
    await userMore();
  });
});

async function userMore() {
  const { default: userEvent } = await import('@testing-library/user-event');
  await userEvent.setup().click(screen.getByRole('button', { name: /more columns/ }));
  expect(screen.queryByRole('columnheader', { name: 'your players' })).not.toBeInTheDocument();
}

describe('headshots on the nfl page', () => {
  const decorative = (root: ParentNode) => {
    for (const a of root.querySelectorAll('.avatar')) expect(a).toHaveAttribute('aria-hidden', 'true');
    for (const img of root.querySelectorAll('img.avatar-img')) expect(img).toHaveAttribute('alt', '');
  };
  const bg = (el: Element | null) => (el as HTMLElement).style.getPropertyValue('--av-bg');

  it('puts each stats leader on his team’s colour, the name staying the link’s name', async () => {
    setup({ route: '/nfl?tab=stats' });
    const table = await screen.findByRole('table', { name: /passing leaders by yds/ });
    const pat = within(table).getByRole('link', { name: 'Pat Bishop' }).closest('tr')!;
    const quinn = within(table).getByRole('link', { name: 'Quinn Aaron' }).closest('tr')!;
    expect(pat.querySelector('.avatar')).toHaveAttribute('data-size', '28');
    expect(bg(pat.querySelector('.avatar'))).toBe(TEAM_COLORS.LAC!.primary);
    expect(bg(quinn.querySelector('.avatar'))).toBe(TEAM_COLORS.KC!.primary);
    decorative(table);
  });

  it('puts each team leader of the box score on his team’s colour, 28 px', async () => {
    const { user } = setup();
    await user.click(await card('N2', 'N1'));
    const dlg = await screen.findByRole('dialog', { name: /N2 at N1/i });
    const box = (await within(dlg).findByRole('heading', { name: 'team leaders' })).closest('section')!;
    await within(box).findByText('Bo Leader');
    const bo = within(box).getByRole('link', { name: 'Bo Leader' }).closest('dd')!;
    expect(bo.querySelector('.avatar')).toHaveAttribute('data-size', '28');
    // N1 is not a real team, so the colour stays neutral instead of guessing
    expect(bo.querySelector('.avatar')).not.toHaveAttribute('data-team');
    // one headshot for each leader line that has a player
    expect(box.querySelectorAll('.nf-ldr dd > .avatar')).toHaveLength(box.querySelectorAll('.nf-ldr dd a').length);
    decorative(box);
  });

  it('puts a headshot on every row of your players, your league and the waiver watch', async () => {
    const { user } = setup();
    await user.click(await card('N2', 'N1'));
    const dlg = await screen.findByRole('dialog');
    const mine = await within(dlg).findByRole('list', { name: 'your players in this game' });
    const alex = within(mine).getByText('Alex Arm').closest('li')!;
    expect(alex.querySelector('.avatar')).toHaveAttribute('data-size', '28');
    expect(mine.querySelectorAll('li')).toHaveLength(mine.querySelectorAll('li .avatar').length);
    decorative(mine);
    await user.click(within(dlg).getByRole('radio', { name: /your league/ }));
    const league = await within(dlg).findByRole('list', { name: 'your league in this game' });
    expect(league.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(league.querySelectorAll('li')).toHaveLength(league.querySelectorAll('li .avatar').length);
    expect(within(league).getByText('Quinn Quarterback').closest('li')).toHaveTextContent('Reed Between the Lines');
    await user.click(within(dlg).getByRole('radio', { name: 'waiver watch' }));
    const wire = await within(dlg).findByRole('list', { name: 'waiver watch' });
    const fran = within(wire).getByRole('link', { name: 'Free Agent Fran' }).closest('li')!;
    expect(fran.querySelector('.avatar')).toBeInTheDocument();
    expect(wire.querySelectorAll('li')).toHaveLength(wire.querySelectorAll('li .avatar').length);
    decorative(wire);
  });
});
