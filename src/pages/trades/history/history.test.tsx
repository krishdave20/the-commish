import { cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadModel } from '../../../app/loadModel';
import { renderApp } from '../../../app/testUtils';
import type { Transaction } from '../../../data';
import type { RealTrade } from '../../../engine/tradefinder/index.ts';
import { bigTrade, evenTrade, seasonModel } from '../../../engine/tradefinder/test-helpers';
import { FAKE_AS_OF, createFakeApi, createFakeSleeper, sampleAccount, sampleBundle, sampleLeague, sampleLoadModel } from '../../../test/fakes';
import { HISTORY_TAB } from '../finder/labels';

// the model builds and the page renders in a worker-less jsdom: give a busy machine room
configure({ asyncUtilTimeout: 8000 });

afterEach(() => { cleanup(); window.localStorage.clear(); });

const linked = [sampleAccount()];
const league = { ...sampleLeague, roster_positions: ['QB', 'WR', 'WR', 'BN', 'BN'] };

const load: LoadModel = async (ctx) => {
  const base = await sampleLoadModel(() => seasonModel())(ctx);
  return { ...base, extras: { ...base.extras!, league } };
};

/** a trade as Sleeper writes it */
const tx = (t: RealTrade, o: Partial<Transaction> = {}): Transaction => ({
  transaction_id: t.id, type: 'trade', status: 'complete', roster_ids: t.teams.map((x) => x.rid), created: Date.UTC(2026, 8, 20 + t.week),
  adds: Object.fromEntries(t.teams.flatMap((x) => x.got.map((p) => [p, x.rid]))), drops: Object.fromEntries(t.teams.flatMap((x) => x.sent.map((p) => [p, x.rid]))), ...o,
});

function setup(byWeek: Record<number, Transaction[]>, o: { fail?: boolean; route?: string } = {}) {
  const sleeper = Object.assign(createFakeSleeper(), {
    transactions: vi.fn(async (_id: string, week: number) => {
      if (o.fail) throw new Error('Sleeper is down');
      return { data: byWeek[week] ?? [], asOf: FAKE_AS_OF, fromCache: false, stale: false, bytes: 1, ms: 1, status: 200 };
    }),
  });
  const api = createFakeApi({ bundles: { L1: sampleBundle(league) } });
  return renderApp({ linked, route: o.route ?? '/trades?tab=history', sleeper, api, loadModel: load });
}

const cards = () => Array.from(screen.getByRole('list', { name: 'trades, newest first' }).querySelectorAll<HTMLElement>(':scope > li'));

describe('trade history tab', () => {
  it('shows the real trades newest first, each side graded, with the labels', async () => {
    const { sleeper } = setup({ 3: [tx(bigTrade)], 4: [tx(evenTrade)] });
    expect(await screen.findByRole('heading', { level: 2, name: HISTORY_TAB })).toBeInTheDocument();
    await screen.findByRole('list', { name: 'trades, newest first' });
    expect(sleeper.transactions).toHaveBeenCalledTimes(5);
    const [late, early] = cards();
    expect(late).toHaveTextContent('week 4');
    expect(late).toHaveTextContent('close to even');
    expect(within(late!).getAllByLabelText('grade C+')).toHaveLength(2);
    expect(early).toHaveTextContent('week 3');
    expect(early).toHaveTextContent('Aces won this one: +80.0 lineup points against −80.0 for Bees');
    expect(within(early!).getByLabelText('grade A+')).toBeInTheDocument();
    expect(within(early!).getByLabelText('grade F')).toBeInTheDocument();
    expect(within(early!).getByText('trade of the year')).toBeInTheDocument();
    expect(within(early!).getByText('fleece of the week 3')).toHaveAttribute('title', 'fleece of the week 3: Aces +80.0 lineup points to Bees −80.0');
    expect(within(early!).getByText('trade of the year')).toHaveAttribute('title', expect.stringContaining('160.0 point gap'));
    // the signed-in team is marked
    expect(within(early!).getByText('you')).toBeInTheDocument();
    expect(within(late!).queryByText('you')).not.toBeInTheDocument();
  });

  it('shows the points the players scored since and the lineup swing for each side', async () => {
    setup({ 3: [tx(bigTrade)] });
    const card = (await screen.findByRole('list', { name: 'trades, newest first' })).querySelector('li')!;
    const aces = within(card).getByRole('list', { name: 'numbers for Aces' });
    expect(aces).toHaveTextContent('lineup swing +80.0 pts (+20.0 played, +60.0 to come)');
    expect(aces).toHaveTextContent('scored since 40.0 from what came in vs 20.0 from what left, 2 weeks');
    const bees = within(card).getByRole('list', { name: 'numbers for Bees' });
    expect(bees).toHaveTextContent('lineup swing −80.0 pts');
  });

  it('the headline strip counts trades, yours and the trade of the year', async () => {
    setup({ 3: [tx(bigTrade)], 4: [tx(evenTrade)] });
    const strip = await screen.findByRole('group', { name: 'trades in your league' });
    expect(within(strip).getByText('trades made').closest('.kpi')).toHaveTextContent('2');
    expect(within(strip).getByText('your trades').closest('.kpi')).toHaveTextContent('1');
    expect(within(strip).getByText('your trades').closest('.kpi')).toHaveTextContent('best grade A+');
    expect(within(strip).getByText('trade of the year').closest('.kpi')).toHaveTextContent('week 3');
  });

  it('ignores waivers, free agents and failed trades', async () => {
    setup({ 3: [tx(bigTrade), tx({ ...evenTrade, id: 'veto' }, { status: 'failed' }), { transaction_id: 'w', type: 'waiver', status: 'complete', adds: { x: 1 } }] });
    await screen.findByRole('list', { name: 'trades, newest first' });
    expect(cards()).toHaveLength(1);
  });

  it('simulates your playoff odds today with and without each deal', async () => {
    setup({ 3: [tx(bigTrade)] });
    await screen.findByRole('list', { name: 'trades, newest first' });
    await waitFor(() => expect(cards()[0]).toHaveTextContent(/playoff odds today \d+% with the deal, \d+% without/), { timeout: 20000 });
  }, 30000);

  it('says so, and points to the finder, when the league has no trades', async () => {
    const { user } = setup({});
    expect(await screen.findByText(/no trades have gone through in this league this season/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'trades in your league' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'see trade ideas' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'trade finder' })).toBeInTheDocument();
  });

  it('shows a plain error when the transactions cannot be read', async () => {
    setup({}, { fail: true });
    expect(await screen.findByText(/could not read the league’s transactions/)).toBeInTheDocument();
    expect(screen.getByText(/Sleeper is down/)).toBeInTheDocument();
  });

  it('names the weeks that could not be read while showing the rest', async () => {
    const sleeper = Object.assign(createFakeSleeper(), {
      transactions: vi.fn(async (_id: string, week: number) => {
        if (week === 2) throw new Error('week 2 transactions not found (HTTP 404)');
        return { data: week === 3 ? [tx(bigTrade)] : [], asOf: FAKE_AS_OF, fromCache: false, stale: false, bytes: 1, ms: 1, status: 200 };
      }),
    });
    renderApp({ linked, route: '/trades?tab=history', sleeper, api: createFakeApi({ bundles: { L1: sampleBundle(league) } }), loadModel: load });
    await screen.findByRole('list', { name: 'trades, newest first' });
    expect(screen.getByText(/week 2 transactions could not be read/)).toBeInTheDocument();
  });
});
