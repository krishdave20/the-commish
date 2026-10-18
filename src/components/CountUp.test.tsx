import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CountUp } from './CountUp';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CountUp and reduced motion', () => {
  it('shows the final value at once when the viewer asked for reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: !q.includes('no-preference'), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = render(<CountUp value={71} />);
    expect(container.textContent).toBe('71');
  });

  it('starts from zero when motion is fine', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('no-preference'), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    const slow = render(<CountUp value={71} duration={100000} />);
    expect(slow.container.textContent).toBe('0');
  });
});
