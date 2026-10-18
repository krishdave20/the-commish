import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../../app/testUtils';
import type { LoadModel } from '../../../app/loadModel';
import type { Model, ModelPlayer } from '../../../engine';
import { sampleAccount, sampleLoadModel, sampleModel } from '../../../test/fakes';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const linked = [sampleAccount()];
const ROUTE = '/waivers?tab=streamers';

/** The sample league (slots QB, RB, WR; Alex Arm starts at QB with 20.0) plus free-agent quarterbacks for weeks 6 and 7. */
function withQbs(m: Model, specs: Array<{ pid: string; name: string; mu6: number; mu7: number; opp?: string; dvp?: number }>): Model {
  const base = m.players.find((p) => p.pid === 't1qb')!;
  for (const s of specs) {
    const p: ModelPlayer = {
      ...base, pid: s.pid, name: s.name, ownerRid: 0, nfl: 'ZZZ', injury: '', seasonAvg: null, adds72h: 0, pts: {},
      mu: { ...base.mu, 6: s.mu6, 7: s.mu7 }, lo: { ...base.lo, 6: s.mu6 * 0.5, 7: s.mu7 * 0.5 }, hi: { ...base.hi, 6: s.mu6 * 1.5, 7: s.mu7 * 1.5 },
      opp: { ...base.opp, 6: s.opp ?? 'ARI', 7: 'SEA' }, dvp: { ...base.dvp, 6: s.dvp ?? 1.3, 7: 0.8 },
    };
    m.players.push(p);
  }
  return m;
}

const loadWith = (specs: Parameters<typeof withQbs>[1], tweak?: (m: Model) => void): LoadModel => sampleLoadModel(() => {
  const m = withQbs(sampleModel(), specs);
  tweak?.(m);
  return m;
});

const STREAMS = [
  { pid: 'fq1', name: 'Stream Quarterback', mu6: 22.5, mu7: 14 },
  { pid: 'fq2', name: 'Spare Quarterback', mu6: 16, mu7: 22 },
];

const qbTable = async () => screen.findByRole('table', { name: 'Streamers: qb' });

describe('streamers tab (/waivers?tab=streamers)', () => {
  it('opens with the best stream, the fills, and a card per position', async () => {
    renderApp({ linked, route: ROUTE, loadModel: loadWith(STREAMS) });
    const strip = await screen.findByRole('group', { name: 'Best stream' });
    expect(within(strip).getByText('best stream').closest('.kpi')).toHaveTextContent('Stream Quarterback');
    expect(within(strip).getByText('best stream').closest('.kpi')).toHaveTextContent('qb vs ARI · 22.5 proj · +2.5 over your qb');
    expect(within(strip).getByText('needs a fill').closest('.kpi')).toHaveTextContent('none');
    expect(within(strip).getByText('upgrades').closest('.kpi')).toHaveTextContent('1');
    expect(screen.getByRole('heading', { level: 2, name: 'streamers' })).toBeInTheDocument();
    // the sample league starts a qb, a rb and a wr: only the qb is a streaming spot (no flex slot, no te, k or def)
    expect(screen.getByRole('heading', { level: 3, name: 'qb' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'flex fliers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'k' })).not.toBeInTheDocument();
  });

  it('shows player, opponent with its grade, projection, floor to ceiling and the gap to your starter', async () => {
    renderApp({ linked, route: ROUTE, loadModel: loadWith(STREAMS) });
    const table = await qbTable();
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['player', 'opp', 'proj', 'floor–ceiling', 'vs your starter', 'try']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const top = rows[0]!;
    expect(within(top).getByText('Stream Quarterback')).toBeInTheDocument();
    expect(within(top).getByText('ARI')).toBeInTheDocument();
    expect(within(top).getByRole('img', { name: 'soft matchup (1.30×)' })).toBeInTheDocument();
    expect(within(top).getByText('22.5')).toBeInTheDocument();
    expect(within(top).getByText('11.3–33.8')).toBeInTheDocument();
    expect(within(top).getByText('+2.5')).toBeInTheDocument();
    expect(within(top).getByText('upgrade')).toBeInTheDocument();
    expect(within(top).getByText('over Alex Arm')).toBeInTheDocument();
    // 16.0 is 4 under the starter: no upgrade flag
    const spare = rows[1]!;
    expect(within(spare).getByText('−4.0')).toBeInTheDocument();
    expect(within(spare).queryByText('upgrade')).not.toBeInTheDocument();
  });

  it('keeps the two-week total, the next three opponents and the bid behind more columns', async () => {
    const { user } = renderApp({ linked, route: ROUTE, loadModel: loadWith(STREAMS) });
    const table = await qbTable();
    await within(table).findByText('Stream Quarterback');
    expect(within(table).queryByText('2-week total')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'more columns: streamers' }));
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['player', 'opp', 'proj', 'floor–ceiling', 'vs your starter', '2-week total', 'next 3', 'faab bid', 'try'],
    );
    const top = within(table).getByText('Stream Quarterback').closest('tr')!;
    const spare = within(table).getByText('Spare Quarterback').closest('tr')!;
    expect(within(top).getByText('36.5')).toBeInTheDocument(); // 22.5 + 14
    expect(within(spare).getByText('38.0')).toBeInTheDocument(); // 16 + 22: the better hold
    expect(within(spare).getByText('hold')).toBeInTheDocument();
    expect(within(top).queryByText('hold')).not.toBeInTheDocument();
    const ahead = top.querySelector('.stream-ahead')!;
    expect(ahead.textContent).toBe('6ARI7SEA8YYY'); // week and opponent, three weeks
    // on the waiver board: its bid. Not on it: the small stream note.
    await waitFor(() => expect(within(top).getByText(/^\$\d+$/)).toBeInTheDocument());
    expect(within(spare).getByText('$0–1 stream')).toBeInTheDocument();
  });

  it('switches to the week after', async () => {
    const { user } = renderApp({ linked, route: ROUTE, loadModel: loadWith(STREAMS) });
    const table = await qbTable();
    await within(table).findByText('Stream Quarterback');
    const strip = screen.getByRole('group', { name: 'Best stream' });
    await user.click(screen.getByRole('radio', { name: 'week after' }));
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Spare Quarterback'));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('SEA');
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('22.0');
    expect(within(strip).getByText('best stream').closest('.kpi')).toHaveTextContent('Spare Quarterback');
    await user.click(screen.getByRole('radio', { name: 'next week' }));
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Stream Quarterback'));
  });

  it('explains itself behind a ?', async () => {
    const { user } = renderApp({ linked, route: ROUTE, loadModel: loadWith(STREAMS) });
    await user.click(await screen.findByRole('button', { name: 'about streamers' }));
    expect(screen.getByRole('note')).toHaveTextContent('streamers are free agents ranked by next week’s projection, which already includes the matchup; the grade shows why.');
  });

  it('try adds him to the what-if and opens the locker room', async () => {
    const { user } = renderApp({ linked, route: ROUTE, loadModel: loadWith(STREAMS) });
    await user.click(await screen.findByRole('button', { name: 'try adding Stream Quarterback' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'locker room' })).toBeInTheDocument();
    expect(screen.getByText(/looking at a what-if: add Stream Quarterback/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('wr.scenario.L1')!).adds).toEqual(['fq1']);
  });

  it('names the position that needs a fill when your starter is on bye', async () => {
    const load = loadWith(STREAMS, (m) => {
      const qb = m.players.find((p) => p.pid === 't1qb')!;
      qb.opp[6] = 'BYE';
      qb.mu[6] = 0;
    });
    renderApp({ linked, route: ROUTE, loadModel: load });
    const strip = await screen.findByRole('group', { name: 'Best stream' });
    expect(within(strip).getByText('needs a fill').closest('.kpi')).toHaveTextContent('bye week fill for Alex Arm');
    expect(within(strip).getByText('needs a fill').closest('.kpi')).toHaveTextContent('qb');
    expect(screen.getByRole('heading', { level: 3, name: 'qb' }).closest('section')).toHaveTextContent('bye week fill for Alex Arm');
    const table = await qbTable();
    const top = within(table).getAllByRole('row')[1]!;
    expect(within(top).getByText('+22.5')).toBeInTheDocument();
    expect(within(top).getByText('fills an empty slot')).toBeInTheDocument();
  });

  it('has an empty state when nobody beats your starters', async () => {
    renderApp({ linked, route: ROUTE, loadModel: loadWith([{ pid: 'fq3', name: 'Weak Arm', mu6: 11, mu7: 11 }]) });
    expect(await screen.findByText("no streamer beats your starters this week. you're set.")).toBeInTheDocument();
    const strip = screen.getByRole('group', { name: 'Best stream' });
    expect(within(strip).getByText('best stream').closest('.kpi')).toHaveTextContent('nobody beats your starters');
    // the list is still there for planning
    expect(within(await qbTable()).getByText('Weak Arm')).toBeInTheDocument();
  });

  it('says so when no free agent has a game', async () => {
    renderApp({ linked, route: ROUTE });
    expect(await screen.findByText('no free agent has a game and a projection that week.')).toBeInTheDocument();
  });

  it('is a tab on the waiver wire beside the wire and the risers', async () => {
    const { user } = renderApp({ linked, route: '/waivers', loadModel: loadWith(STREAMS) });
    await screen.findByRole('table', { name: 'Waiver wire' });
    await user.click(screen.getByRole('radio', { name: 'streamers' }));
    expect(await qbTable()).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Waiver wire' })).not.toBeInTheDocument();
  });
});
