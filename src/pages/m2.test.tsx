import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../app/testUtils';
import { FAKE_AS_OF, sampleAccount, sampleLoadModel, sampleModel } from '../test/fakes';
import type { LoadModel } from '../app/loadModel';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const linked = [sampleAccount()];
const rowOf = (table: HTMLElement, text: string) => within(table).getByText(text).closest('tr')!;

describe('engine pages share one frame', () => {
  it('shows the pull progress in the header while the model loads', async () => {
    const loadModel: LoadModel = ({ onProgress }) => {
      onProgress({ done: 23, total: 41, label: 'week 7 projections' });
      return new Promise(() => {});
    };
    renderApp({ linked, route: '/team', loadModel });
    expect(await screen.findByText('pulling week 7 projections · 23 of 41')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Refreshing data' })).toHaveAttribute('aria-valuenow', '23');
    expect(screen.getByRole('heading', { level: 1, name: 'locker room' })).toBeInTheDocument();
  });

  it('shows the model as-of stamp and Refresh forces a rebuild', async () => {
    const loadModel = vi.fn(sampleLoadModel());
    const { user } = renderApp({ linked, route: '/waivers', loadModel });
    expect(await screen.findByText('Data as of Fri, Oct 16, 4:05 PM')).toBeInTheDocument();
    expect(loadModel).toHaveBeenCalledTimes(1);
    expect(loadModel.mock.calls[0]![0]).toMatchObject({ leagueId: 'L1', userId: 'u1', force: false });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(loadModel).toHaveBeenCalledTimes(2));
    expect(loadModel.mock.calls[1]![0]).toMatchObject({ force: true });
    expect(FAKE_AS_OF).toBeGreaterThan(0);
  });

  it('says so when the model cannot be built', async () => {
    renderApp({ linked, route: '/race', loadModel: () => Promise.reject(new Error('Sleeper is down')) });
    expect(await screen.findByText('could not build the model. Sleeper is down')).toBeInTheDocument();
  });
});

describe('a model built without its first simulation (oddsPending)', () => {
  const pendingLoad = sampleLoadModel(() => ({ ...sampleModel(), oddsPending: true }));

  it('renders at once with quiet "simming…" odds, then fills them from the worker run', async () => {
    const { user } = renderApp({ linked, route: '/race', loadModel: pendingLoad });
    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    expect(within(table).getAllByText('simming…')).toHaveLength(4);
    // strict-math marks and records do not wait for the simulation
    expect(rowOf(table, 'Sunday Scaries')).toBeInTheDocument();

    await waitFor(() => expect(within(table).queryAllByText('simming…')).toHaveLength(0), { timeout: 4000 });
    // playoff and title odds fill in (the flush odds wait behind "more columns")
    expect(within(rowOf(table, 'Sunday Scaries')).getAllByText(/^(>99|<1|\d+)%$/).length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole('radio', { name: 'odds detail' }));
    expect(await screen.findByRole('img', { name: 'Seed odds for 4 teams' })).toBeInTheDocument();
  });

  it('says the seeding odds are simming on the odds detail tab', async () => {
    renderApp({ linked, route: '/race?tab=odds', loadModel: pendingLoad });
    expect(await screen.findByText('simming seeding odds…')).toBeInTheDocument();
  });

  it('also fills the Lab odds', async () => {
    renderApp({ linked, route: '/team?tab=lab', loadModel: pendingLoad });
    const lab = (await screen.findByRole('heading', { level: 2, name: 'the lab' })).closest('section')!;
    await waitFor(() => expect(within(lab).queryByText('…')).not.toBeInTheDocument(), { timeout: 4000 });
    expect(within(lab).getByText('no changes yet')).toBeInTheDocument();
  });

  it('a model that already has its odds is left alone', async () => {
    renderApp({ linked, route: '/race' });
    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    expect(within(table).queryAllByText('simming…')).toHaveLength(0);
  });
});

describe('locker room (/team)', () => {
  it('opens with a strip and the lineup; the roster and the lab are their own tabs', async () => {
    const { container, user } = renderApp({ linked, route: '/team' });
    expect(await screen.findByRole('heading', { level: 1, name: 'locker room' })).toBeInTheDocument();
    expect(screen.getByText('your roster and lineup · week 5')).toBeInTheDocument();

    const strip = await screen.findByRole('group', { name: 'This week' });
    expect(within(strip).getAllByText(/./, { selector: '.kpi .micro' }).map((e) => e.textContent)).toEqual(['projected points', 'win chance', 'lineup status']);
    expect(within(strip).getByText('lineup status').closest('.kpi')).toHaveTextContent('set');
    expect(within(strip).getByText('win chance').closest('.kpi')).toHaveTextContent(/\d+%/);

    const tabs = screen.getByRole('radiogroup', { name: 'Locker room sections' });
    expect(within(tabs).getAllByRole('radio').map((r) => r.textContent)).toEqual(['lineup', 'roster', 'the lab']);
    expect(within(tabs).getByRole('radio', { name: 'lineup' })).toBeChecked();

    // lineup tab: the lineup, the start/sit alerts and the weekly chart (folded away until asked for)
    const lineup = screen.getByRole('table', { name: 'Lineup for week 5' });
    expect(within(lineup).getByText('total')).toBeInTheDocument();
    expect(screen.getByText(/best possible/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'start/sit alerts' })).toBeInTheDocument();
    expect(await screen.findByText(/consider adding Free Agent Fran for Backup Wideout/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Roster' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'the lab' })).not.toBeInTheDocument();
    const weekly = screen.getByRole('heading', { level: 2, name: 'weekly projection' }).closest('details')!;
    expect(weekly).not.toHaveAttribute('open');
    await user.click(screen.getByRole('heading', { level: 2, name: 'weekly projection' }));
    await waitFor(() => expect(container.querySelectorAll('.actual-dot')).toHaveLength(4));
    expect(container.querySelectorAll('.po-shade')).toHaveLength(2);

    // roster tab
    await user.click(within(tabs).getByRole('radio', { name: 'roster' }));
    const roster = await screen.findByRole('table', { name: 'Roster' });
    expect(within(roster).getAllByRole('row')).toHaveLength(1 + 4);
    expect(within(roster).getByText('Alex Arm')).toBeInTheDocument();
    expect(within(roster).getByText('Questionable')).toBeInTheDocument();
    expect(screen.getByText(/open a name on the scouting report for usage, trade value and takes/)).toBeInTheDocument();
    expect(screen.queryByText(/milestone/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Lineup for week 5' })).not.toBeInTheDocument();

    // the lab tab
    await user.click(within(tabs).getByRole('radio', { name: 'the lab' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'the lab' })).toBeInTheDocument();
  });

  it('roster: the secondary columns wait behind “more columns”', async () => {
    const { user } = renderApp({ linked, route: '/team?tab=roster' });
    const roster = await screen.findByRole('table', { name: 'Roster' });
    expect(within(roster).queryByRole('columnheader', { name: /avg/ })).not.toBeInTheDocument();
    expect(within(roster).queryByRole('columnheader', { name: /team/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more columns/ }));
    expect(within(roster).getByRole('columnheader', { name: /avg/ })).toBeInTheDocument();
    expect(within(roster).getByRole('columnheader', { name: /team/ })).toBeInTheDocument();
  });

  it('lineup: the opponent and range columns wait behind “more columns”', async () => {
    const { user } = renderApp({ linked, route: '/team' });
    const lineup = await screen.findByRole('table', { name: 'Lineup for week 5' });
    expect(within(lineup).queryByRole('columnheader', { name: 'range' })).not.toBeInTheDocument();
    expect(within(lineup).queryByRole('columnheader', { name: 'opp' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more columns/ }));
    expect(within(lineup).getByRole('columnheader', { name: 'range' })).toBeInTheDocument();
    expect(within(lineup).getByRole('columnheader', { name: 'opp' })).toBeInTheDocument();
  });

  it('switches the lineup week and pins a bench player, which costs points and raises the banner', async () => {
    const { user } = renderApp({ linked, route: '/team' });
    await screen.findByRole('table', { name: 'Lineup for week 5' });
    await user.click(screen.getByRole('radio', { name: 'wk 7' }));
    expect(screen.getByRole('table', { name: 'Lineup for week 7' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'wk 5' }));

    expect(screen.queryByText(/looking at a what-if/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'pin Backup Wideout: always start' }));
    expect(screen.getByRole('button', { name: 'pin Backup Wideout: always start' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/pins and benches cost/)).toHaveTextContent('6.0');
    expect(screen.getByText(/looking at a what-if: always start Backup Wideout/)).toBeInTheDocument();
  });

  it('the lab: points per game, drop, add a free agent, preset and save', async () => {
    const { user } = renderApp({ linked, route: '/team?tab=lab' });
    const lab = (await screen.findByRole('heading', { level: 2, name: 'the lab' })).closest('section')!;
    expect(within(lab).getByText('no changes yet')).toBeInTheDocument();

    await user.type(within(lab).getByLabelText('Points per game for Walt Wideout'), '30');
    await user.tab();
    expect(await screen.findByText(/Walt Wideout 30.0 pts\/game/)).toBeInTheDocument();

    await user.click(within(lab).getByRole('checkbox', { name: 'Drop Backup Wideout' }));
    expect(screen.getByText(/drop Backup Wideout/)).toBeInTheDocument();

    await user.click(within(lab).getByRole('button', { name: /^add \w+ Free Agent Fran/ }));
    expect(within(lab).getByRole('button', { name: 'Remove Free Agent Fran' })).toBeInTheDocument();
    expect(screen.getByText(/add Free Agent Fran/)).toBeInTheDocument();

    await user.selectOptions(within(lab).getByLabelText('Out until for Rex Runner'), '8');
    expect(screen.getByText(/Rex Runner back week 8/)).toBeInTheDocument();

    // odds arrive from the worker-backed simulation
    await waitFor(() => expect(within(lab).getByText(/points$/)).toBeInTheDocument(), { timeout: 4000 });
    // saved what-ifs fold away until opened
    await user.click(within(lab).getByRole('heading', { level: 3, name: 'saved what-ifs' }));
    await user.type(within(lab).getByLabelText('name'), 'rex out');
    await user.click(within(lab).getByRole('button', { name: 'save this what-if' }));
    expect(within(lab).getByText('rex out')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('wr.saved.L1')!)).toHaveLength(1);

    await user.click(within(lab).getByRole('button', { name: 'reset what-if' }));
    expect(screen.queryByText(/looking at a what-if/)).not.toBeInTheDocument();
    await user.click(within(lab).getByRole('button', { name: 'Load rex out' }));
    expect(screen.getByText(/looking at a what-if/)).toBeInTheDocument();
  }, 15000);

  it('offers a preset for an injured player', async () => {
    const { user } = renderApp({ linked, route: '/team?tab=lab' });
    await user.click(await screen.findByRole('button', { name: 'Backup Wideout out until week 9' }));
    expect(screen.getByText(/Backup Wideout back week 9/)).toBeInTheDocument();
  });
});

describe('playoff picture (/race)', () => {
  it('opens with your odds, seed and magic number, then the standings; the rest is on tabs', async () => {
    renderApp({ linked, route: '/race' });
    expect(await screen.findByRole('heading', { level: 1, name: 'playoff picture' })).toBeInTheDocument();
    expect(screen.getByText('standings, odds, clinch marks')).toBeInTheDocument();
    const strip = await screen.findByRole('group', { name: 'Your playoff picture' });
    expect(within(strip).getAllByText(/./, { selector: '.kpi .micro' }).map((e) => e.textContent)).toEqual(['your playoff odds', 'projected seed', 'magic number']);
    expect(within(strip).getByText('magic number').closest('.kpi')).toHaveTextContent(/\d|—/);

    const tabs = screen.getByRole('radiogroup', { name: 'Playoff picture sections' });
    expect(within(tabs).getAllByRole('radio').map((r) => r.textContent)).toEqual(['standings', 'brackets', 'playoff machine', 'odds detail']);

    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 4);
    expect(rowOf(table, 'Sunday Scaries')).toHaveClass('me');
    // the how-it-works notes sit behind the "?"
    expect(screen.getByText(/the top 2 teams by record make it, points for breaking ties\./)).toBeInTheDocument();
    expect(screen.getByText(/no team has clinched or been eliminated yet/)).toBeInTheDocument();
    expect(screen.getByLabelText('Clinch marks')).toBeInTheDocument();
    // the default columns: rank, team, record, pf, playoffs, title
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''))).toEqual(['#', 'team', 'record', 'pf', 'playoffs', 'title']);
    expect(screen.queryByRole('heading', { level: 2, name: 'magic number' })).not.toBeInTheDocument();
  });

  it('standings: “more columns” adds all-play, luck, expected wins and status (and division in a divisional league)', async () => {
    const { user } = renderApp({ linked, route: '/race' });
    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    await user.click(screen.getByRole('button', { name: /more columns/ }));
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''));
    for (const h of ['all-play', 'luck', 'exp wins', 'status']) expect(heads).toContain(h);
  });

  it('odds detail tab: seeding odds and the magic number', async () => {
    const { container } = renderApp({ linked, route: '/race?tab=odds' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Seeding Odds'.toLowerCase() })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll('rect.heat-cell')).toHaveLength(4 * 3));
    expect(screen.getByRole('heading', { level: 2, name: 'magic number' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Chance of making the playoffs by final win total/ })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Playoff picture standings' })).not.toBeInTheDocument();
  });

  it('opens a team drawer from a row and closes it with Escape', async () => {
    const { user } = renderApp({ linked, route: '/race' });
    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    await user.click(within(table).getByText('Reed Between the Lines'));
    const dialog = await screen.findByRole('dialog', { name: 'Reed Between the Lines' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('img', { name: /Weekly points: / })).toBeInTheDocument();
    expect(within(dialog).getByText('next games')).toBeInTheDocument();
    expect(within(dialog).getByText(/Reed Receiver/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sorts the standings from the column headers', async () => {
    const { user } = renderApp({ linked, route: '/race' });
    const table = await screen.findByRole('table', { name: 'Playoff picture standings' });
    await user.click(within(table).getByRole('button', { name: /^pf/ }));
    expect(within(table).getByRole('columnheader', { name: /^pf/ })).toHaveAttribute('aria-sort', 'descending');
    const first = within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[1];
    expect(first).toHaveTextContent('Sunday Scaries');
  });

  describe('playoff machine', () => {
    async function machine() {
      const utils = renderApp({ linked, route: '/race?tab=machine' });
      const section = (await screen.findByRole('heading', { level: 2, name: 'playoff machine' })).closest('section')!;
      const table = within(section).getByRole('table', { name: 'Playoff machine standings' });
      return { ...utils, section, table };
    }

    it('picking a winner changes the record, and clicking again clears it', async () => {
      const { user, section, table } = await machine();
      expect(within(rowOf(table, 'Reed Between the Lines')).getByText('2–2')).toBeInTheDocument();
      expect(within(section).getByText(/no picks yet/)).toBeInTheDocument();

      const games = within(section).getByRole('group', { name: 'Games this week' });
      const reed = within(games).getByRole('button', { name: /Reed Between the Lines/ });
      await user.click(reed);
      expect(reed).toHaveAttribute('aria-pressed', 'true');
      expect(within(rowOf(table, 'Reed Between the Lines')).getByText('3–2')).toBeInTheDocument();
      expect(within(rowOf(table, 'Sunday Scaries')).getByText('3–2')).toBeInTheDocument();
      expect(within(section).getByText('1 of 8 remaining games picked.')).toBeInTheDocument();

      await user.click(reed);
      expect(within(rowOf(table, 'Reed Between the Lines')).getByText('2–2')).toBeInTheDocument();
      expect(within(section).getByText(/no picks yet/)).toBeInTheDocument();
    });

    it('marks come from the clinch math at once, and Clear resets them', async () => {
      const { user, section, table } = await machine();
      expect(within(table).queryByRole('img', { name: 'clinched a playoff spot' })).not.toBeInTheDocument();
      await user.click(within(section).getByRole('button', { name: 'you win out' }));
      const mine = rowOf(table, 'Sunday Scaries');
      expect(within(mine).getByRole('img', { name: 'clinched a playoff spot' })).toBeInTheDocument();
      expect(within(mine).getByText('7–1')).toBeInTheDocument();
      expect(within(section).getByText(/clinched with these picks/)).toBeInTheDocument();
      await user.click(within(section).getByRole('button', { name: 'clear' }));
      expect(within(table).queryByRole('img', { name: 'clinched a playoff spot' })).not.toBeInTheDocument();
      expect(within(rowOf(table, 'Sunday Scaries')).getByText('3–1')).toBeInTheDocument();
    });

    it('picks favorites for this week and for all weeks', async () => {
      const { user, section } = await machine();
      await user.click(within(section).getByRole('button', { name: 'pick favorites (this week)' }));
      expect(within(section).getByText('2 of 8 remaining games picked.')).toBeInTheDocument();
      await user.click(within(section).getByRole('button', { name: 'pick favorites (all)' }));
      expect(within(section).getByText('8 of 8 remaining games picked.')).toBeInTheDocument();
      await user.click(within(section).getByRole('radio', { name: /wk 6/ }));
      const games = within(section).getByRole('group', { name: 'Games this week' });
      expect(within(games).getAllByRole('button', { pressed: true })).toHaveLength(2);
    });

    it('re-simulates after picks and shows the change against the baseline', async () => {
      const { user, section, table } = await machine();
      await user.click(within(section).getByRole('button', { name: 'you win out' }));
      const mine = rowOf(table, 'Sunday Scaries');
      await waitFor(() => expect(within(mine).getByText(/^\+\d+$/)).toBeInTheDocument(), { timeout: 4000 });
    }, 10000);
  });
});

describe('waiver wire (/waivers)', () => {
  it('lists free agents with lineup lift, and the window changes the list', async () => {
    const { user } = renderApp({ linked, route: '/waivers' });
    expect(await screen.findByRole('heading', { level: 1, name: 'waiver wire' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Waiver wire' });
    expect(within(table).getByText('Free Agent Fran')).toBeInTheDocument();
    expect(within(table).getByText('Wire Runner')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /lineup lift/ })).toBeInTheDocument();
    // the default columns: player, pos, lineup lift, bid, drop, try
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''))).toEqual(['player', 'pos', 'lineup lift', 'faab bid', 'drop', 'try']);
    const fran = rowOf(table, 'Free Agent Fran');
    expect(within(fran).getByText('+16.0')).toBeInTheDocument();
    expect(within(fran).getByText('Backup Wideout')).toBeInTheDocument();
    expect(within(fran).getByText(/^\$\d+$/)).toBeInTheDocument();
    expect(within(fran).queryByText('4/4')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more columns/ }));
    expect(within(fran).getByText('4/4')).toBeInTheDocument();
    expect(within(fran).getByText('12k')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'playoff weeks' }));
    await waitFor(() => expect(within(table).queryByText('Wire Runner')).not.toBeInTheDocument());
    expect(within(table).getByText('Free Agent Fran')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'next week' }));
    expect(await within(table).findByText('Wire Runner')).toBeInTheDocument();
  });

  it('opens with the best add, its lineup lift and bid', async () => {
    renderApp({ linked, route: '/waivers' });
    const strip = await screen.findByRole('group', { name: 'Best add' });
    await waitFor(() => expect(within(strip).getByText('best add').closest('.kpi')).toHaveTextContent('Free Agent Fran'));
    expect(within(strip).getByText('lineup lift').closest('.kpi')).toHaveTextContent('+16.0');
    expect(within(strip).getByText('faab bid').closest('.kpi')).toHaveTextContent(/\$\d+/);
  });

  it('filters by position', async () => {
    const { user } = renderApp({ linked, route: '/waivers' });
    const table = await screen.findByRole('table', { name: 'Waiver wire' });
    await within(table).findByText('Free Agent Fran'); // the board has resolved
    await user.click(await screen.findByRole('radio', { name: /^rb$/i }));
    expect(within(table).queryByText('Free Agent Fran')).not.toBeInTheDocument();
    expect(within(table).getByText('Wire Runner')).toBeInTheDocument();
  });

  it('sorts from the headers', async () => {
    const { user } = renderApp({ linked, route: '/waivers' });
    const table = await screen.findByRole('table', { name: 'Waiver wire' });
    await user.click(within(table).getByRole('button', { name: /^player/ }));
    expect(within(table).getByRole('columnheader', { name: /^player/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[0]).toHaveTextContent('Free Agent Fran');
  });

  it('try adds the add and the drop to the what-if and goes to the locker room', async () => {
    const { user } = renderApp({ linked, route: '/waivers' });
    await user.click(await screen.findByRole('button', { name: 'try adding Free Agent Fran and dropping Backup Wideout' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'locker room' })).toBeInTheDocument();
    expect(screen.getByText(/looking at a what-if: add Free Agent Fran; drop Backup Wideout/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('wr.scenario.L1')!)).toMatchObject({ adds: ['fa1'], drops: ['t1bw'] });
  });

  it('has an empty state and a usage risers placeholder', async () => {
    const loadModel = sampleLoadModel(() => {
      const m = sampleModel();
      m.players = m.players.filter((p) => p.ownerRid !== 0);
      return m;
    });
    const { user } = renderApp({ linked, route: '/waivers', loadModel });
    const none = await screen.findByText('nobody on the wire beats your bench this window.');
    expect(none).toBeInTheDocument();
    expect(none.closest('.art-empty')!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // usage risers are the second tab
    expect(screen.queryByRole('heading', { level: 2, name: 'usage risers' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'trending & risers' }));
    expect(screen.getByRole('heading', { level: 2, name: 'usage risers' })).toBeInTheDocument();
    expect(screen.getByText('nflverse data arrives with the nightly update.')).toBeInTheDocument();
  });
});

describe('trade block (/trades)', () => {
  it('scores a deal: KPIs, the verdict and playoff odds from the worker', async () => {
    const { user } = renderApp({ linked, route: '/trades' });
    await user.selectOptions(await screen.findByLabelText('trade partner'), 'Reed Between the Lines');
    expect(screen.getByText(/tick players on both sides to score a deal/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'you send: Backup Wideout' }));
    await user.click(screen.getByRole('checkbox', { name: 'you get from Reed Between the Lines: Reed Receiver' }));

    expect(await screen.findByText('your lineup, wks 6–8')).toBeInTheDocument();
    expect(screen.getByText('their lineup')).toBeInTheDocument();
    expect(screen.getByText('your playoff weeks')).toBeInTheDocument();
    expect(screen.getByText(/Both lineups get better|Good for you|Helps them more|Close to neutral/)).toBeInTheDocument();
    expect(await screen.findByText(/^from \d+% \([+−±]\d+\)$/, undefined, { timeout: 4000 })).toBeInTheDocument();
  }, 10000);

  it('lists handshake deals and Load fills the analyzer', async () => {
    const { user } = renderApp({ linked, route: '/trades?tab=deals' });
    await user.click(await screen.findByRole('button', { name: 'Load Backup Wideout for Reed Receiver' }));
    expect(screen.getByLabelText('trade partner')).toHaveValue('2');
    expect(screen.getByRole('checkbox', { name: 'you send: Backup Wideout' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'you get from Reed Between the Lines: Reed Receiver' })).toBeChecked();
    expect(await screen.findByText('your lineup, wks 6–8')).toBeInTheDocument();
    // loading a deal switches to the analyzer tab
    expect(screen.getByRole('radio', { name: 'analyzer' })).toBeChecked();
  });

  it('is five tabs: analyzer, handshake deals, trade finder, trade history and dynasty', async () => {
    const { user } = renderApp({ linked, route: '/trades' });
    const tabs = await screen.findByRole('radiogroup', { name: 'Trade block sections' });
    expect(within(tabs).getAllByRole('radio').map((r) => r.textContent)).toEqual(['analyzer', 'handshake deals', 'trade finder', 'trade history', 'dynasty']);
    expect(screen.getByRole('heading', { level: 2, name: 'the analyzer' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'handshake deals' })).not.toBeInTheDocument();
    await user.click(within(tabs).getByRole('radio', { name: 'handshake deals' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'handshake deals' })).toBeInTheDocument();
    // the deal table: send, get, partner, my lift and load; the rest behind more columns
    const deals = screen.getByRole('table', { name: 'Handshake deals' });
    expect(within(deals).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''))).toEqual(['you send', 'you get', 'partner', 'your lineup lift', 'load']);
  });

  it('explains that ideas are for your own team when viewing another team', async () => {
    const loadModel = sampleLoadModel(() => {
      const m = sampleModel();
      m.teams.find((t) => t.rid === m.meRid)!.ownerId = 'someone-else';
      return m;
    });
    renderApp({ linked, route: '/trades?tab=deals', loadModel });
    expect(await screen.findByText(/deal ideas are worked out for your own team/)).toBeInTheDocument();
  });

  it('offers dynasty mode as a quiet explore switch in a redraft league (details in dynasty.test.tsx)', async () => {
    renderApp({ linked, route: '/trades?tab=dynasty' });
    expect(await screen.findByRole('heading', { level: 2, name: 'contender or rebuilder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dynasty mode: explore' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/this league is redraft/)).toBeInTheDocument();
  });
});

describe('what-if scenario', () => {
  it('persists across pages and Reset clears it', async () => {
    const { user } = renderApp({ linked, route: '/waivers' });
    await user.click(await screen.findByRole('button', { name: 'try adding Free Agent Fran and dropping Backup Wideout' }));
    expect(await screen.findByText(/looking at a what-if/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'trade block' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'trade block' })).toBeInTheDocument();
    expect(screen.getByText(/looking at a what-if: add Free Agent Fran/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'waiver wire' }));
    expect(await screen.findByText(/looking at a what-if/)).toBeInTheDocument();
    await screen.findByRole('table', { name: 'Waiver wire' });
    expect(screen.queryByRole('button', { name: /try adding Free Agent Fran/ })).not.toBeInTheDocument(); // already added in the what-if

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByText(/looking at a what-if/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem('wr.scenario.L1')).toBeNull();
    expect(await screen.findByRole('button', { name: /try adding Free Agent Fran/ })).toBeInTheDocument();
  });

  it('is restored from localStorage for the league', async () => {
    window.localStorage.setItem('wr.scenario.L1', JSON.stringify({
      overrides: {}, adds: ['fa1'], drops: [], pins: [], benches: [], volatility: 1.25,
    }));
    renderApp({ linked, route: '/team' });
    expect(await screen.findByText(/looking at a what-if: add Free Agent Fran; weekly swing 1.25×/)).toBeInTheDocument();
    expect(await screen.findByText('simming 20,000 seasons…')).toBeInTheDocument();
  });

  it('ignores a broken saved what-if', async () => {
    window.localStorage.setItem('wr.scenario.L1', '{nope');
    renderApp({ linked, route: '/team' });
    expect(await screen.findByRole('heading', { level: 1, name: 'locker room' })).toBeInTheDocument();
    expect(screen.queryByText(/looking at a what-if/)).not.toBeInTheDocument();
  });
});

describe('under the hood (/method)', () => {
  it('explains the model with numbers from the model', async () => {
    renderApp({ linked, route: '/method' });
    expect(await screen.findByRole('heading', { level: 1, name: 'under the hood' })).toBeInTheDocument();
    const bars = await screen.findByRole('list', { name: 'Offline projection check' });
    expect(within(bars).getAllByRole('listitem')).toHaveLength(4);
    expect(within(bars).getByText('4.39')).toBeInTheDocument();
    expect(within(bars).getByText('4.68')).toBeInTheDocument();
    expect(screen.getByText(/not enough finished weeks yet/)).toBeInTheDocument();
    const cal = screen.getByRole('table', { name: 'Floor and ceiling calibration by position' });
    expect(within(cal).getAllByRole('row')).toHaveLength(1 + 6);
    expect(screen.getByText('20.0')).toBeInTheDocument(); // team weekly sd
    expect(screen.getByText('20,000')).toBeInTheDocument();
    expect(screen.getByText(/league data: sleeper public api/)).toBeInTheDocument();
    expect(screen.getByLabelText('Clinch marks')).toBeInTheDocument();
  });
});
