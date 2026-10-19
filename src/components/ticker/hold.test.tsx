import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTickerMode } from './useTickerMode';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('the ticker holds its space open', () => {
  it('is off with no scores and no memory of having had any', () => {
    expect(renderHook(() => useTickerMode()).result.current).toBe('off');
  });

  it('is held (an empty band, so nothing below jumps) while the scores load, when they were there last time, and lets go after a few seconds', () => {
    vi.useFakeTimers();
    window.localStorage.setItem('wr.ticker.seen.v1', 'on');
    const { result } = renderHook(() => useTickerMode());
    expect(result.current).toBe('hold');
    act(() => { vi.advanceTimersByTime(6500); });
    expect(result.current).toBe('off');
  });
});
