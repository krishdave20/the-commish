import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftPick } from '../../data';
import { INITIAL_FEED, feedReducer, liveSource, nextDelay, normalizePicks, replaySource } from './pickFeed';
import type { PickSource, PollResult } from './pickFeed';
import { usePickFeed } from './usePickFeed';

const pick = (n: number, pid = `p${n}`): DraftPick => ({ round: 1, pick_no: n, player_id: pid, roster_id: ((n - 1) % 6) + 1 });
const picksTo = (n: number) => Array.from({ length: n }, (_, i) => pick(i + 1));

function Harness({ source, intervalMs, auto, immediate }: { source: PickSource | null; intervalMs?: number; auto?: boolean; immediate?: boolean }) {
  const { state, pollNow } = usePickFeed({ source, intervalMs, auto, immediate });
  return (
    <div>
      <output aria-label="count">{state.picks.length}</output>
      <output aria-label="failures">{state.failures}</output>
      <output aria-label="complete">{String(state.complete)}</output>
      <output aria-label="error">{state.error ?? ''}</output>
      <output aria-label="last">{state.lastUpdate === null ? '' : 'yes'}</output>
      <button type="button" onClick={() => { void pollNow(); }}>poll now</button>
    </div>
  );
}

const text = (label: string) => screen.getByLabelText(label).textContent;
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); setHidden(false); });

/** a source whose answers the test scripts: each call takes the next entry (an Error rejects) */
function scripted(...answers: Array<PollResult | Error>) {
  let i = 0;
  const poll = vi.fn(async () => {
    const a = answers[Math.min(i++, answers.length - 1)]!;
    if (a instanceof Error) throw a;
    return a;
  });
  return { kind: 'live', poll } as PickSource & { poll: ReturnType<typeof vi.fn> };
}

describe('the poller', () => {
  it('polls at once, then every 4 seconds', async () => {
    const src = scripted({ picks: picksTo(1) }, { picks: picksTo(2) }, { picks: picksTo(3) });
    render(<Harness source={src} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(src.poll).toHaveBeenCalledTimes(1);
    expect(text('count')).toBe('1');
    await act(async () => { await vi.advanceTimersByTimeAsync(3900); });
    expect(src.poll).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(src.poll).toHaveBeenCalledTimes(2);
    expect(text('count')).toBe('2');
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(src.poll).toHaveBeenCalledTimes(3);
    expect(text('count')).toBe('3');
    expect(text('last')).toBe('yes');
  });

  it('waits while the tab is hidden and polls straight away when it comes back', async () => {
    const src = scripted({ picks: picksTo(1) });
    render(<Harness source={src} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(src.poll).toHaveBeenCalledTimes(1);
    act(() => setHidden(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(src.poll).toHaveBeenCalledTimes(1);
    act(() => setHidden(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(src.poll).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(src.poll).toHaveBeenCalledTimes(3);
  });

  it('backs off after errors (8 s, 16 s, then 30 s at most) and recovers on the first good answer', async () => {
    const boom = new Error('offline');
    const src = scripted(boom, boom, boom, boom, { picks: picksTo(2) });
    render(<Harness source={src} />);
    let now = 0;
    const until = async (t: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(t - now); }); now = t; };
    await until(0);
    expect(src.poll).toHaveBeenCalledTimes(1);
    expect(text('failures')).toBe('1');
    expect(text('error')).toBe('offline');
    await until(7999);
    expect(src.poll).toHaveBeenCalledTimes(1);
    await until(8000);
    expect(src.poll).toHaveBeenCalledTimes(2); // 8 s after the first failure
    await until(23_999);
    expect(src.poll).toHaveBeenCalledTimes(2);
    await until(24_000);
    expect(src.poll).toHaveBeenCalledTimes(3); // 16 s after the second
    await until(53_999);
    expect(src.poll).toHaveBeenCalledTimes(3);
    await until(54_000);
    expect(src.poll).toHaveBeenCalledTimes(4); // 30 s after the third, not 32
    expect(text('failures')).toBe('4');
    await until(83_999);
    expect(src.poll).toHaveBeenCalledTimes(4);
    await until(84_000);
    expect(src.poll).toHaveBeenCalledTimes(5); // 30 s again (the cap), and this one works
    expect(text('failures')).toBe('0');
    expect(text('error')).toBe('');
    expect(text('count')).toBe('2');
    await until(87_999);
    expect(src.poll).toHaveBeenCalledTimes(5);
    await until(88_000);
    expect(src.poll).toHaveBeenCalledTimes(6); // back to 4 s
  });

  it('stops for good once the draft is complete', async () => {
    const src = scripted({ picks: picksTo(1) }, { picks: picksTo(24), complete: true, status: 'complete' });
    render(<Harness source={src} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(src.poll).toHaveBeenCalledTimes(2);
    expect(text('complete')).toBe('true');
    expect(text('count')).toBe('24');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(src.poll).toHaveBeenCalledTimes(2);
  });

  it('starts over when the source changes', async () => {
    const a = scripted({ picks: picksTo(5) });
    const b = scripted({ picks: picksTo(2) });
    const { rerender } = render(<Harness source={a} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(text('count')).toBe('5');
    rerender(<Harness source={b} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(text('count')).toBe('2');
    rerender(<Harness source={null} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(text('count')).toBe('0');
    const before = a.poll.mock.calls.length + b.poll.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(a.poll.mock.calls.length + b.poll.mock.calls.length).toBe(before);
  });
});

describe('the live source', () => {
  const sleeperWith = (picks: DraftPick[], status: string | Error = 'drafting') => ({
    draftPicks: vi.fn(async () => ({ data: picks })),
    draft: vi.fn(async () => { if (status instanceof Error) throw status; return { data: { status } }; }),
  }) as unknown as Parameters<typeof liveSource>[0];

  it('forces both reads and reports the status', async () => {
    const s = sleeperWith(picksTo(3), 'paused');
    const r = await liveSource(s, 'D1', 24).poll();
    expect(s.draftPicks).toHaveBeenCalledWith('D1', { force: true });
    expect(s.draft).toHaveBeenCalledWith('D1', { force: true });
    expect(r).toMatchObject({ status: 'paused', complete: false });
    expect(r.picks).toHaveLength(3);
  });
  it('is complete when sleeper says so, or when every pick is in', async () => {
    expect((await liveSource(sleeperWith(picksTo(3), 'complete'), 'D1', 24).poll()).complete).toBe(true);
    expect((await liveSource(sleeperWith(picksTo(24)), 'D1', 24).poll()).complete).toBe(true);
  });
  it('does not fail the poll when only the status read fails', async () => {
    const r = await liveSource(sleeperWith(picksTo(3), new Error('nope')), 'D1', 24).poll();
    expect(r.picks).toHaveLength(3);
    expect(r.status).toBeUndefined();
  });
});

describe('the reducer and the replay source', () => {
  it('keeps picks sorted and unique, and the same array when nothing changed', () => {
    expect(normalizePicks([pick(3), pick(1), pick(2), pick(2, 'again')]).map((p) => p.player_id)).toEqual(['p1', 'again', 'p3']);
    const a = feedReducer(INITIAL_FEED, { type: 'polled', result: { picks: picksTo(2) }, at: 1 });
    const b = feedReducer(a, { type: 'polled', result: { picks: picksTo(2) }, at: 2 });
    expect(b.picks).toBe(a.picks);
    expect(b.lastUpdate).toBe(2);
    const c = feedReducer(b, { type: 'failed', message: 'x' });
    expect(c).toMatchObject({ failures: 1, error: 'x', picks: a.picks });
    expect(feedReducer(c, { type: 'polled', result: { picks: picksTo(3) }, at: 3 })).toMatchObject({ failures: 0, error: null });
    expect(feedReducer(c, { type: 'reset' })).toBe(INITIAL_FEED);
  });
  it('backoff doubles from the interval and stops at 30 s', () => {
    expect([0, 1, 2, 3, 4].map((f) => nextDelay(4000, f))).toEqual([4000, 8000, 16_000, 30_000, 30_000]);
  });
  it('the replay hands out one more pick on every poll and finishes with the draft', async () => {
    const src = replaySource([pick(2), pick(1), pick(3)]);
    expect((await src.poll()).picks.map((p) => p.pick_no)).toEqual([1]);
    expect((await src.poll()).picks.map((p) => p.pick_no)).toEqual([1, 2]);
    const last = await src.poll();
    expect(last).toMatchObject({ complete: true, status: 'complete' });
    expect(last.picks).toHaveLength(3);
    expect((await src.poll()).picks).toHaveLength(3);
    expect(src.cursor).toBe(3);
  });
  it('through the poller, a replay runs one pick a second and stops at the end', async () => {
    const src = replaySource(picksTo(4));
    render(<Harness source={src} intervalMs={1000} immediate={false} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(text('count')).toBe('0');
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(text('count')).toBe('1');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(text('count')).toBe('3');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(text('count')).toBe('4');
    expect(text('complete')).toBe('true');
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(src.cursor).toBe(4);
  });
  it('in step mode a replay moves only when asked', async () => {
    const src = replaySource(picksTo(4));
    render(<Harness source={src} intervalMs={1000} auto={false} immediate={false} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(text('count')).toBe('0');
    await act(async () => { screen.getByRole('button', { name: 'poll now' }).click(); await vi.advanceTimersByTimeAsync(0); });
    expect(text('count')).toBe('1');
    await act(async () => { screen.getByRole('button', { name: 'poll now' }).click(); await vi.advanceTimersByTimeAsync(0); });
    expect(text('count')).toBe('2');
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(text('count')).toBe('2');
  });
});
