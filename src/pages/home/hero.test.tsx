import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { applyNowParam, resetNowOverride } from '../../app/moments/nowOverride';
import { renderApp } from '../../app/testUtils';
import {
  createFakeSleeper, liveSampleModel, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, sampleScores, stubBuildTakes,
} from '../../test/fakes';
import type { FakeGameState } from '../../test/fakes';

afterEach(() => {
  cleanup();
  resetNowOverride();
  window.localStorage.clear();
});

const linked = [sampleAccount()];
const MIN = 60_000;

/** The huddle over a league whose week-5 games are in the given states. */
function huddle(o: { pts?: Record<string, number>; a?: FakeGameState; b?: FakeGameState; kickoff?: number; route?: string } = {}) {
  const sleeper = createFakeSleeper({
    live: {
      matchups: (w) => sampleLiveMatchups(w === 5 ? (o.pts ?? {}) : {}),
      scores: (w) => sampleScores({ a: o.a ?? 'pre', b: o.b ?? 'pre', kickoff: w === 5 ? o.kickoff : Date.now() - 9 * 86_400_000 }),
      projections: () => sampleLiveProjections(),
    },
  });
  return renderApp({ linked, route: o.route ?? '/', sleeper, loadModel: sampleLoadModel(liveSampleModel), buildTakes: stubBuildTakes() });
}

const hero = () => screen.getByRole('region', { name: 'this week in a sentence' });

describe('huddle: the sentence hero', () => {
  it('before the games: who you face and your chance, in words', async () => {
    huddle({ kickoff: Date.now() + 30 * MIN });
    await waitFor(() => expect(hero()).toHaveTextContent(/Sunday Scaries faces Reed Between the Lines this week\. \d+% to win\./));
    expect(hero()).toHaveTextContent(/you win \d+ of every 100 simulations$/);
  });

  it('while the games are on: who leads, the score and the live odds, with the biggest starters on each side', async () => {
    huddle({ a: 'live', b: 'live', kickoff: Date.now() - 30 * MIN, pts: { t1qb: 10, t1rb: 5, t1wr: 6, t2qb: 4, t2rb: 3, t2wr: 2 } });
    await waitFor(() => expect(hero()).toHaveTextContent('Sunday Scaries leads Reed Between the Lines 21.0 to 9.0.'));
    expect(hero()).toHaveTextContent(/you win \d+ of every 100 simulations from here/);
    expect(within(hero()).getByRole('img', { name: 'your top starters' })).toBeInTheDocument();
    expect(within(hero()).getByRole('img', { name: 'their top starters' })).toBeInTheDocument();
  });

  it('when it is over: beat or lost to', async () => {
    huddle({ a: 'final', b: 'final', kickoff: Date.now() - 6 * 3_600_000, pts: { t1qb: 10, t1rb: 5, t1wr: 6, t2qb: 14, t2rb: 13, t2wr: 12 } });
    await waitFor(() => expect(hero()).toHaveTextContent('Sunday Scaries lost to Reed Between the Lines 21.0 to 39.0.'));
    expect(within(hero()).queryByText(/simulations/)).not.toBeInTheDocument();
  });
});

describe('huddle: the game plan', () => {
  it('is a dark card of ranked actions with an arrow to each page; the clock decides what leads', async () => {
    applyNowParam('2026-10-20T20:00'); // a Tuesday evening: waivers run overnight
    const { user } = huddle({ a: 'final', b: 'final', kickoff: Date.now() - 6 * 3_600_000 });
    const plan = (await screen.findByRole('heading', { level: 2, name: 'your game plan' })).closest('section')!;
    const list = within(plan).getByRole('list', { name: 'Top actions right now' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(/waivers process (tonight|tomorrow|wednesday) at \d+:\d\d (am|pm)/));
    const first = within(list).getAllByRole('listitem')[0]!;
    expect(first).toHaveTextContent(/your top add is Free Agent Fran \(\+[\d.]+ lineup lift\)/);
    expect(within(first).getByRole('link', { name: /^open the waiver wire: waivers process/ })).toHaveAttribute('href', '/waivers');
    expect(within(list).getAllByRole('listitem').length).toBeLessThanOrEqual(3);

    // the preview is announced, with a way back
    expect(screen.getByText(/previewing the clock: tue oct 20, 8:00 pm/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'back to live' })).toHaveAttribute('href', '/?now=live');

    // the rest of the plan stays folded until asked for
    const more = within(plan).queryByRole('button', { name: /see the whole plan/ });
    if (more) {
      expect(more).toHaveAttribute('aria-expanded', 'false');
      await user.click(more);
      expect(more).toHaveAttribute('aria-expanded', 'true');
      expect(within(plan).getByRole('list', { name: 'The rest of the plan' })).toBeVisible();
    }
  });

  it('says so when nothing needs you', async () => {
    applyNowParam('2026-10-21T14:00'); // Wednesday afternoon, but with no lineup swaps and no waiver news the plan is thin
    huddle({ a: 'final', b: 'final', kickoff: Date.now() - 6 * 3_600_000 });
    const plan = (await screen.findByRole('heading', { level: 2, name: 'your game plan' })).closest('section')!;
    await waitFor(() => expect(plan.querySelector('.plan-row, .plan-empty')).not.toBeNull());
  });

  it('is replaced by the draft’s own plan before the draft', async () => {
    applyNowParam('2026-10-20T20:00');
    huddle({ route: '/?phase=pre_draft' });
    expect(await screen.findByText('previewing: pre-draft')).toBeInTheDocument();
    const plan = (await screen.findByRole('heading', { level: 2, name: 'your game plan' })).closest('section')!;
    expect(plan).toBeInTheDocument();
    // no in-season actions in a pre-draft plan
    expect(plan).not.toHaveTextContent(/waivers process/);
  });
});
