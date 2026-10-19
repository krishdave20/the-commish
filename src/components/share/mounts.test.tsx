/* The share button is where the moment is: one test per mount location. */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBracket } from '../../engine';
import type { BracketCtx } from '../../engine';
import { renderApp } from '../../app/testUtils';
import {
  createFakeSleeper, liveSampleModel, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, sampleScores, stubBuildTakes,
} from '../../test/fakes';
import { mount as mountDraft } from '../../pages/draft/grades/testKit';
import { Bracket } from '../bracket/Bracket';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const linked = [sampleAccount()];

describe('share buttons: where they live', () => {
  it('the matchup on game day (the main event)', async () => {
    const sleeper = createFakeSleeper({
      live: {
        matchups: (w) => sampleLiveMatchups(w === 5 ? { t1qb: 10, t2qb: 4 } : {}),
        scores: (w) => sampleScores({ a: 'live', b: 'final', kickoff: w === 5 ? undefined : Date.now() - 8 * 86_400_000 }),
        projections: () => sampleLiveProjections(),
      },
    });
    renderApp({ linked, route: '/gameday', sleeper, loadModel: sampleLoadModel(liveSampleModel) });
    const main = (await screen.findByRole('heading', { level: 2, name: 'the main event' })).closest('section')!;
    expect(within(main).getByRole('button', { name: 'share this matchup' })).toHaveTextContent('share');
  });

  it('a hot take', async () => {
    renderApp({ linked, route: '/takes', nflverse: true, buildTakes: stubBuildTakes() });
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));
    for (const card of screen.getAllByRole('article')) expect(within(card).getByRole('button', { name: 'share this take' })).toBeInTheDocument();
  });

  it('a bracket (picks and champion)', () => {
    const list = [101, 102, 103, 104];
    const bracket = buildBracket({ kind: 'championship', seedOrder: list, rules: { weekStart: 15, roundType: 0, seedType: 0 } });
    const ctx: BracketCtx = { means: Object.fromEntries(list.map((r) => [r, { 15: 120, 16: 120, 17: 120 }])), sd: 20, currentWeek: 6 };
    render(<Bracket bracket={bracket} ctx={ctx} names={new Map(list.map((r) => [r, `Team ${r}`]))} meRid={102} />);
    expect(screen.getByRole('button', { name: 'share this bracket' })).toBeInTheDocument();
  });

  it('your draft grade', async () => {
    mountDraft({ route: '/draft?tab=grades' });
    const section = (await screen.findByRole('heading', { level: 2, name: 'draft grades' })).closest('section')!;
    expect(within(section).getByRole('button', { name: 'share this draft grade' })).toBeInTheDocument();
  });

  it('the huddle hero', async () => {
    const sleeper = createFakeSleeper({
      live: {
        matchups: (w) => sampleLiveMatchups(w === 5 ? { t1qb: 10, t2qb: 4 } : {}),
        scores: (w) => sampleScores({ a: 'live', b: 'live', kickoff: w === 5 ? Date.now() - 30 * 60_000 : Date.now() - 9 * 86_400_000 }),
        projections: () => sampleLiveProjections(),
      },
    });
    renderApp({ linked, route: '/', sleeper, loadModel: sampleLoadModel(liveSampleModel), buildTakes: stubBuildTakes() });
    await screen.findByRole('region', { name: 'this week in a sentence' });
    // the button sits right under the hero, outside its region, so the hero's own text stays the sentence and the odds
    expect(await screen.findByRole('button', { name: 'share this week' })).toBeInTheDocument();
  });
});
