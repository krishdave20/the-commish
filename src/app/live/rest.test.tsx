import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeSleeper, liveSampleModel, sampleLiveMatchups, sampleLiveProjections, sampleScores } from '../../test/fakes';
import { DataContext } from '../dataContext';
import { ModelContext } from '../modelContext';
import type { ModelValue } from '../modelContext';
import { LiveProvider } from './LiveProvider';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const H = 3_600_000, DAY = 24 * H;

/** A provider over a league whose week is over: every game of week 5 is final, week 6 kicks off in two days. */
function harness() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const t0 = Date.now();
  const nfl = { week: 5 };
  const sleeper = Object.assign(createFakeSleeper({
    live: {
      matchups: () => sampleLiveMatchups({ t1qb: 10 }),
      scores: (w) => (w === 5 ? sampleScores({ a: 'final', b: 'final', kickoff: t0 - 8 * H }) : sampleScores({ a: 'pre', b: 'pre', kickoff: t0 + 2 * DAY })),
      projections: () => sampleLiveProjections(),
    },
  }), {
    nflState: vi.fn(async () => ({ data: { week: nfl.week, season: '2026', season_type: 'regular' }, asOf: Date.now(), fromCache: false, stale: false, bytes: 1, ms: 1, status: 200 })),
  });
  const refresh = vi.fn(async () => {});
  const model = liveSampleModel();
  const mv = { model, engine: null, extras: null, baseSim: null, asOf: 0, stale: false, fromCache: false, loading: false, progress: null, error: undefined, refresh } as unknown as ModelValue;
  render(
    <DataContext.Provider value={{ sleeper } as never}>
      <ModelContext.Provider value={mv}>
        <LiveProvider><span>child</span></LiveProvider>
      </ModelContext.Provider>
    </DataContext.Provider>,
  );
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  return { sleeper, nfl, refresh, advance };
}

describe('a week rollover', () => {
  it('re-renders the provider with a new week without a React warning (every effect keeps a constant-size dependency list)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t0 = Date.now();
    const sleeper = createFakeSleeper({
      live: {
        matchups: () => sampleLiveMatchups({ t1qb: 10 }),
        scores: (w) => sampleScores({ a: 'pre', b: 'pre', kickoff: t0 + w * DAY }),
        projections: () => sampleLiveProjections(),
      },
    });
    const value = (week: number) => {
      const model = liveSampleModel();
      model.meta.currentWeek = week;
      return { model, engine: null, extras: null, baseSim: null, asOf: 0, stale: false, fromCache: false, loading: false, progress: null, error: undefined, refresh: async () => {} } as unknown as ModelValue;
    };
    const tree = (week: number) => (
      <DataContext.Provider value={{ sleeper } as never}>
        <ModelContext.Provider value={value(week)}><LiveProvider><span>child</span></LiveProvider></ModelContext.Provider>
      </DataContext.Provider>
    );
    const { rerender } = render(tree(5));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    rerender(tree(6));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    rerender(tree(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('the live poller after every game is final', () => {
  it('rests instead of stopping: no polls for hours, then it wakes, re-reads the NFL calendar and polls again', async () => {
    const { sleeper, advance } = harness();
    await advance(10);
    expect(sleeper.liveMatchups).toHaveBeenCalledTimes(1);
    // it looked up next week's kickoffs to know how long to rest
    expect((sleeper.scores as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[1])).toEqual([5, 6]);
    // nothing for just under three hours: no 30 s polling, no calendar reads
    await advance(3 * H - 60_000);
    expect(sleeper.liveMatchups).toHaveBeenCalledTimes(1);
    expect(sleeper.nflState).not.toHaveBeenCalled();
    // it wakes: reads the calendar (forced), polls once, and goes back to sleep
    await advance(2 * 60_000);
    expect(sleeper.nflState).toHaveBeenCalledTimes(1);
    expect(sleeper.nflState).toHaveBeenCalledWith({ force: true });
    expect(sleeper.liveMatchups).toHaveBeenCalledTimes(2);
    await advance(2 * H);
    expect(sleeper.liveMatchups).toHaveBeenCalledTimes(2);
  });

  it('rolls over to the new week when the calendar has moved: the model is rebuilt', async () => {
    const { sleeper, nfl, refresh, advance } = harness();
    await advance(10);
    await advance(3 * H + 60_000);
    // same week at the first wake-up: nothing to rebuild
    expect(refresh).not.toHaveBeenCalled();
    nfl.week = 6;
    await advance(3 * H + 60_000);
    expect(sleeper.nflState).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
