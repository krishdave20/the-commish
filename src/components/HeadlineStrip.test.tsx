import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HeadlineStrip } from './HeadlineStrip';

afterEach(cleanup);

describe('HeadlineStrip', () => {
  it('is a named group of figures with labels and sub-lines', () => {
    render(
      <HeadlineStrip label="your season" items={[
        { label: 'record', value: <span>2–3</span>, sub: '9th of 12' },
        { label: 'playoff odds', value: <span>24%</span> },
        { label: 'this week', value: <span>112.4</span>, sub: '57% to win' },
      ]} />,
    );
    const strip = screen.getByRole('group', { name: 'your season' });
    expect(within(strip).getByText('record')).toBeInTheDocument();
    expect(within(strip).getByText('2–3')).toBeInTheDocument();
    expect(within(strip).getByText('9th of 12')).toBeInTheDocument();
    expect(strip.querySelectorAll('.kpi')).toHaveLength(3);
    expect(strip.className).toContain('strip');
  });
});
