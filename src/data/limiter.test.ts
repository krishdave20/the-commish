import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLimiter } from './limiter.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('limiter', () => {
  it('never runs more than 8 requests at once', async () => {
    const lim = createLimiter();
    let live = 0, peak = 0;
    const releases: Array<() => void> = [];
    const task = () => new Promise<void>((res) => {
      live++; peak = Math.max(peak, live);
      releases.push(() => { live--; res(); });
    });
    const all = Array.from({ length: 20 }, () => lim.run(task));
    await vi.advanceTimersByTimeAsync(0);
    expect(live).toBe(8);
    expect(lim.stats().queued).toBe(12);
    while (releases.length) { releases.shift()!(); await vi.advanceTimersByTimeAsync(0); }
    await Promise.all(all);
    expect(peak).toBe(8);
  });

  it('caps starts at 300 per rolling minute and resumes as the window slides', async () => {
    const lim = createLimiter();
    let started = 0;
    const all = Array.from({ length: 350 }, () => lim.run(async () => { started++; }));
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toBe(300);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(started).toBe(300);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(started).toBe(350);
    await Promise.all(all);
  });

  it('spreads a long queue over several windows', async () => {
    const lim = createLimiter({ perMinute: 10 });
    let started = 0;
    const all = Array.from({ length: 25 }, () => lim.run(async () => { started++; }));
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toBe(10);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(started).toBe(20);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(started).toBe(25);
    await Promise.all(all);
  });

  it('passes results and errors through and frees the slot after a failure', async () => {
    const lim = createLimiter({ maxInFlight: 1 });
    const bad = lim.run(async () => { throw new Error('boom'); });
    const good = lim.run(async () => 42);
    await expect(bad).rejects.toThrow('boom');
    await expect(good).resolves.toBe(42);
    expect(lim.stats().inFlight).toBe(0);
  });

  it('survives a task that throws synchronously', async () => {
    const lim = createLimiter();
    await expect(lim.run((() => { throw new Error('sync'); }) as () => Promise<never>)).rejects.toThrow('sync');
    await expect(lim.run(async () => 1)).resolves.toBe(1);
  });
});
