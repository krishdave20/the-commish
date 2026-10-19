import { cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LoadModel } from '../../../app/loadModel';
import { renderApp } from '../../../app/testUtils';
import type { FantasyCalcRow } from '../../../data';
import { finderModel } from '../../../engine/tradefinder/test-helpers';
import { createFakeApi, createFakeSleeper, sampleAccount, sampleBundle, sampleLeague, sampleLoadModel } from '../../../test/fakes';
import { FINDER_TAB } from './labels';

// the model builds and the page renders in a worker-less jsdom: give a busy machine room
configure({ asyncUtilTimeout: 8000 });

afterEach(() => { cleanup(); window.localStorage.clear(); });

const linked = [sampleAccount()];
/** the four-team finder league with a six-man roster limit */
const league = { ...sampleLeague, roster_positions: ['QB', 'RB', 'WR', 'WR', 'BN', 'BN'] };
const dynastyLeague = { ...league, settings: { ...league.settings, type: 2, draft_rounds: 2 } };

const load = (l = league): LoadModel => async (ctx) => {
  const base = await sampleLoadModel(() => finderModel())(ctx);
  return { ...base, extras: { ...base.extras!, league: l } };
};

const row = (id: string, value: number): FantasyCalcRow => ({ player: { id: 1, name: id, sleeperId: id, position: id.startsWith('q') ? 'QB' : 'WR' }, value, overallRank: 1, positionRank: 1, trend30Day: 0 });

function setup(route = '/trades?tab=finder', o: { dynasty?: FantasyCalcRow[] } = {}) {
  const sleeper = createFakeSleeper(o.dynasty ? { fantasyCalcRows: o.dynasty } : {});
  const api = createFakeApi({ bundles: { L1: sampleBundle(o.dynasty ? dynastyLeague : league) } });
  return renderApp({ linked, route, sleeper, api, loadModel: load(o.dynasty ? dynastyLeague : league) });
}

const cards = () => Array.from(screen.getByRole('list', { name: 'trade ideas, best first' }).querySelectorAll<HTMLElement>(':scope > li'));

describe('trade finder tab', () => {
  it('opens from the trade block tabs with a headline strip of your need and surplus', async () => {
    const { user } = setup('/trades');
    await user.click(await screen.findByRole('radio', { name: FINDER_TAB }));
    const strip = await screen.findByRole('group', { name: 'your trade needs' });
    expect(within(strip).getByText('biggest need').closest('.kpi')).toHaveTextContent('qb');
    expect(within(strip).getByText('biggest surplus').closest('.kpi')).toHaveTextContent('wr');
    expect(within(strip).getByText('ideas found').closest('.kpi')).toHaveTextContent(/\d+/);
    expect(screen.getByRole('heading', { level: 2, name: FINDER_TAB })).toBeInTheDocument();
  });

  it('lists idea cards with the explanation, both gains and the roster-limit drop', async () => {
    setup();
    await screen.findByRole('heading', { level: 2, name: FINDER_TAB });
    const first = cards()[0]!;
    expect(first).toHaveTextContent('2-for-1');
    expect(first).toHaveTextContent('with Two');
    expect(first).toHaveTextContent('fills your qb need (+15.0 a week)');
    expect(first).toHaveTextContent('wr depth you never start');
    expect(first).toHaveTextContent('their wr tier goes from thin to strong');
    expect(within(first).getByRole('list', { name: 'lineup gain for each side' })).toHaveTextContent(/you\s*\+75\.0 pts.*Two\s*\+85\.0 pts/);
    expect(first).toHaveTextContent('Two drops j2');
    expect(first.querySelectorAll('.avatar').length).toBeGreaterThanOrEqual(3);
  });

  it('filters by deal type, and shows a rotation as three legs', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { level: 2, name: FINDER_TAB });
    const all = cards().length;
    await user.click(screen.getByRole('radio', { name: '1-for-2' }));
    expect(cards().length).toBeGreaterThan(0);
    expect(cards().length).toBeLessThan(all);
    for (const c of cards()) expect(c).toHaveTextContent('1-for-2');
    await user.click(screen.getByRole('radio', { name: '3-team' }));
    const rot = cards()[0]!;
    expect(rot).toHaveTextContent('3-team');
    expect(within(within(rot).getByRole('list', { name: 'who sends whom' })).getAllByRole('listitem')).toHaveLength(3);
    expect(rot).toHaveTextContent('every lineup gains');
    await user.click(screen.getByRole('radio', { name: 'all' }));
    expect(cards()).toHaveLength(all);
  });

  it('load in analyzer fills the analyzer with the idea\'s players and partner', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { level: 2, name: FINDER_TAB });
    await user.click(within(cards()[0]!).getByRole('button', { name: /load in analyzer/i }));
    // back on the analyzer tab, with the deal ticked
    expect(await screen.findByRole('heading', { level: 2, name: 'the analyzer' })).toBeInTheDocument();
    expect(screen.getByLabelText('trade partner')).toHaveValue('2');
    expect(screen.getByRole('checkbox', { name: 'you send: w3' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'you send: w4' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'you get from Two: q2' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'you send: w1' })).not.toBeChecked();
  });

  it('a rotation loads only your leg and says so', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { level: 2, name: FINDER_TAB });
    await user.click(screen.getByRole('radio', { name: '3-team' }));
    const rot = cards()[0]!;
    expect(rot).toHaveTextContent('loads your leg only');
    await user.click(within(rot).getByRole('button', { name: /load in analyzer.*your leg only/i }));
    expect(await screen.findByRole('heading', { level: 2, name: 'the analyzer' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'you send: w2' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'you get from Two: q2b' })).toBeChecked();
  });

  it('simulates your playoff odds for the best ideas in the worker (here the main-thread fallback)', async () => {
    setup();
    await screen.findByRole('heading', { level: 2, name: FINDER_TAB });
    // the first five get a line: "simulating…" first, then the before and after odds
    expect(cards()[0]).toHaveTextContent(/playoff odds/);
    await waitFor(() => expect(cards()[0]).toHaveTextContent(/your playoff odds \d+% → \d+%/), { timeout: 20000 });
  }, 30000);

  it('flags lopsided offers in a dynasty league, and can hide them', async () => {
    // w3 + w4 are worth 9,000 and q2 only 5,000; q2b is worth 9,000
    const rows = [row('w3', 5000), row('w4', 4000), row('q2', 5000), row('q2b', 9000), row('q3', 9000), row('q3b', 3000), row('w1', 6000), row('w2', 6000), row('r3b', 100), row('w10', 100), row('w11', 100)];
    const { user } = setup('/trades?tab=finder', { dynasty: rows });
    await screen.findByRole('heading', { level: 2, name: FINDER_TAB });
    const lop = await screen.findAllByText(/^lopsided \d+% apart$/);
    expect(lop.length).toBeGreaterThan(0);
    const before = cards().length;
    expect(screen.getAllByText(/dynasty value: you send 9,000 and get 5,000/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('checkbox', { name: 'hide lopsided offers' }));
    expect(cards().length).toBeLessThan(before);
    expect(screen.queryByText(/^lopsided \d+% apart$/)).not.toBeInTheDocument();
  });

  it('says so when a league has nothing to offer', async () => {
    // every wideout on the other teams already beats yours: nobody gains from your spares
    const m = finderModel();
    for (const p of m.players) if (p.ownerRid !== 1 && p.pos === 'WR') for (const w of Object.keys(p.mu)) p.mu[Number(w)] = 40;
    renderApp({
      linked, route: '/trades?tab=finder', sleeper: createFakeSleeper(), api: createFakeApi({ bundles: { L1: sampleBundle(league) } }),
      loadModel: async (ctx) => { const base = await sampleLoadModel(() => m)(ctx); return { ...base, extras: { ...base.extras!, league } }; },
    });
    await screen.findByRole('heading', { level: 2, name: FINDER_TAB });
    expect(screen.queryByRole('list', { name: 'trade ideas, best first' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').map((n) => n.textContent).join(' ')).toMatch(/no deal found where both sides gain|surplus/);
  });
});
