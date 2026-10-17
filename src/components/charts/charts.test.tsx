import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeedHeatmap } from './SeedHeatmap';
import { Sparkline } from './Sparkline';
import { WeeklyProjectionChart } from './WeeklyProjectionChart';
import { WinsNeededChart } from './WinsNeededChart';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function allowMotion() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('no-preference'), media: q, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

const seedRows = [
  { id: 1, team: 'Alpha', seeds: [0.4, 0.2, 0.1, 0.05] },
  { id: 2, team: 'Bravo', seeds: [0.1, 0.2, 0.25, 0.2] },
  { id: 3, team: 'Charlie team with a very long name', seeds: [0, 0.01, 0.02, 0.03], isMe: true },
];

describe('SeedHeatmap', () => {
  it('draws teams x seeds cells plus an Out column', () => {
    const { container } = render(<SeedHeatmap rows={seedRows} divisionSeeds={2} />);
    expect(container.querySelectorAll('rect.heat-cell')).toHaveLength(3 * (4 + 1));
  });

  it('draws exactly teams x seeds cells without the Out column', () => {
    const { container } = render(<SeedHeatmap rows={seedRows} divisionSeeds={2} showOut={false} />);
    expect(container.querySelectorAll('rect.heat-cell')).toHaveLength(3 * 4);
    expect(screen.queryByText('Out')).not.toBeInTheDocument();
  });

  it('marks division-winner seeds and orders teams by total playoff chance', () => {
    const { container } = render(<SeedHeatmap rows={seedRows} divisionSeeds={2} />);
    const kinds = [...container.querySelectorAll('[data-team="Alpha"] rect.heat-cell')].map((r) => r.getAttribute('data-kind'));
    expect(kinds).toEqual(['division', 'division', 'wildcard', 'wildcard', 'out']);
    expect([...container.querySelectorAll('g[data-team]')].map((g) => g.getAttribute('data-team'))).toEqual(
      ['Alpha', 'Bravo', 'Charlie team with a very long name'],
    );
    expect(container.querySelectorAll('.heat-head[data-division="true"]')).toHaveLength(2);
  });

  it('keeps the given order when sorting is off', () => {
    const { container } = render(<SeedHeatmap rows={[...seedRows].reverse()} divisionSeeds={1} sortRows={false} />);
    expect([...container.querySelectorAll('g[data-team]')][0].getAttribute('data-team')).toContain('Charlie');
  });

  it('shows rounded percentages, 99 near certainty, and nothing under 1%', () => {
    const { container } = render(<SeedHeatmap rows={[{ id: 1, team: 'Solo', seeds: [0.998, 0.004] }]} divisionSeeds={1} />);
    const texts = [...container.querySelectorAll('.heat-val')].map((t) => t.textContent);
    expect(texts).toEqual(['99', '', '']);
  });

  it('puts the exact value in each cell tooltip and truncates long names', () => {
    const { container } = render(<SeedHeatmap rows={seedRows} divisionSeeds={2} />);
    expect(container.querySelector('[data-team="Alpha"] rect.heat-cell title')!.textContent).toBe('Alpha: 1st seed 40.0%');
    const name = container.querySelector('[data-team^="Charlie"] .heat-name')!;
    expect(name.firstChild!.textContent).toBe('Charlie team with a…');
    expect(name.querySelector('title')!.textContent).toBe('Charlie team with a very long name');
  });

  it('makes likelier cells darker', () => {
    const { container } = render(<SeedHeatmap rows={[{ id: 1, team: 'A', seeds: [0.9, 0.05] }]} divisionSeeds={2} showOut={false} />);
    const [hi, lo] = [...container.querySelectorAll('rect.heat-cell')].map((r) => r.getAttribute('fill')!);
    const lum = (c: string) => c.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0);
    expect(lum(hi)).toBeLessThan(lum(lo));
  });
});

const buckets = [
  { wins: 7, sims: 5000, made: 400 },
  { wins: 8, sims: 8000, made: 4800 },
  { wins: 9, sims: 6000, made: 5900 },
  { wins: 10, sims: 40, made: 40 },
];

describe('WinsNeededChart', () => {
  it('draws a bar per win total, sorted, with the share and the sim count', () => {
    const { container } = render(<WinsNeededChart buckets={[...buckets].reverse()} />);
    const bars = [...container.querySelectorAll('.wins-bar')];
    expect(bars.map((b) => b.getAttribute('data-wins'))).toEqual(['7', '8', '9', '10']);
    expect(screen.getByText('7W')).toBeInTheDocument();
    expect(screen.getByText('8,000')).toBeInTheDocument(); // sim count under the bar
    expect(screen.getByText('8%')).toBeInTheDocument(); // 400 of 5000
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('98%')).toBeInTheDocument();
    expect(container.querySelector('[data-wins="8"] title')!.textContent).toContain('4,800 of 8,000 simulated seasons');
  });

  it('colours by chance and fades rare outcomes', () => {
    const { container } = render(<WinsNeededChart buckets={buckets} />);
    const rect = (w: number) => container.querySelector(`[data-wins="${w}"] rect`)!;
    expect(rect(7).getAttribute('fill')).toBe('var(--red)');
    expect(rect(8).getAttribute('fill')).toBe('var(--gold)');
    expect(rect(9).getAttribute('fill')).toBe('var(--green)');
    expect(rect(10).getAttribute('opacity')).toBe('0.35');
    expect(rect(9).getAttribute('opacity')).toBe('0.9');
  });

  it('sizes bars by P(playoffs | wins)', () => {
    const { container } = render(<WinsNeededChart buckets={buckets} />);
    const h = (w: number) => Number(container.querySelector(`[data-wins="${w}"] rect`)!.getAttribute('height'));
    expect(h(9)).toBeGreaterThan(h(8));
    expect(h(8)).toBeGreaterThan(h(7));
  });

  it('draws final geometry at once with reduced motion', () => {
    const { container } = render(<WinsNeededChart buckets={buckets} />);
    const style = container.querySelector<SVGElement>('[data-wins="8"] rect')!.style;
    expect(style.transform).toBe('scaleY(1)');
    expect(style.transition).toBe('');
  });

  it('grows bars from zero when motion is allowed', async () => {
    allowMotion();
    const { container } = render(<WinsNeededChart buckets={buckets} />);
    const rect = container.querySelector<SVGElement>('[data-wins="8"] rect')!;
    expect(rect.style.transform).toBe('scaleY(0)');
    expect(rect.style.transition).toContain('transform');
    await waitFor(() => expect(rect.style.transform).toBe('scaleY(1)'));
  });

  it('says so when there are no simulations', () => {
    render(<WinsNeededChart buckets={[]} />);
    expect(screen.getByText('No simulated seasons yet.')).toBeInTheDocument();
  });
});

const weeks = [1, 2, 3, 4, 5, 6].map((week) => ({
  week, expected: 110 + week, floor: 90 + week, ceiling: 135 + week,
  actual: week <= 3 ? 100 + week * 5 : null, playoff: week >= 5,
}));

describe('WeeklyProjectionChart', () => {
  it('draws the band, the expected line, actual dots for finished weeks and shades playoff weeks', () => {
    const { container } = render(<WeeklyProjectionChart weeks={weeks} />);
    expect(container.querySelector('path.band')).not.toBeNull();
    expect(container.querySelector('path.expected')!.getAttribute('d')).toMatch(/^M/);
    expect(container.querySelectorAll('.exp-dot')).toHaveLength(6);
    expect(container.querySelectorAll('.actual-dot')).toHaveLength(3);
    expect(container.querySelectorAll('.po-shade')).toHaveLength(2);
    expect(screen.getByText('playoffs')).toBeInTheDocument();
    expect(container.querySelector('.actual-dot title')!.textContent).toBe('Week 1: scored 105.0');
    expect(container.querySelector('.exp-dot title')!.textContent).toContain('floor 91.0, ceiling 136.0');
  });

  it('draws the line at once with reduced motion, and animates it otherwise', async () => {
    const { container, unmount } = render(<WeeklyProjectionChart weeks={weeks} />);
    expect(container.querySelector<SVGElement>('path.expected')!.style.strokeDashoffset).toBe('');
    unmount();
    allowMotion();
    const again = render(<WeeklyProjectionChart weeks={weeks} />);
    const path = again.container.querySelector<SVGElement>('path.expected')!;
    expect(path.style.strokeDashoffset).toBe('1');
    await waitFor(() => expect(path.style.strokeDashoffset).toBe('0'));
  });

  it('handles an empty list', () => {
    render(<WeeklyProjectionChart weeks={[]} />);
    expect(screen.getByText('No weeks to chart yet.')).toBeInTheDocument();
  });
});

describe('Sparkline', () => {
  it('draws a dot and value per week, coloured by result', () => {
    const { container } = render(<Sparkline points={[{ x: 1, y: 98.4, win: true }, { x: 2, y: 80.2, win: false }, { x: 3, y: 120 }]} />);
    const dots = [...container.querySelectorAll('circle.spark-dot')].map((c) => c.getAttribute('fill'));
    expect(dots).toEqual(['var(--green)', 'var(--red)', 'var(--ink-2)']);
    expect(container.querySelector('path')!.getAttribute('d')).toMatch(/^M/);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Weekly points: 98, 80, 120');
    expect(screen.getByText('98')).toBeInTheDocument();
  });

  it('copes with one point and with none', () => {
    const { container, unmount } = render(<Sparkline points={[{ x: 4, y: 100 }]} />);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(container.querySelector('circle')!.getAttribute('cx')).not.toBe('NaN');
    unmount();
    render(<Sparkline points={[]} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'No weekly points yet');
  });
});

describe('UsageTrendChart', () => {
  const series = [
    { id: 'snap', label: 'snap %', unit: 'snaps', color: 'var(--green)', points: [{ week: 1, value: 0.7, n: 60 }, { week: 2, value: null }, { week: 3, value: 0.85, n: 62 }] },
    { id: 'tgt', label: 'target share', color: 'var(--gold)', points: [{ week: 1, value: 0.2, n: 30 }, { week: 2, value: 0.25, n: 28 }, { week: 3, value: 0.3, n: 33 }] },
  ];

  it('draws a line per series, dots only where there is a value, and the sample size in the tooltip', async () => {
    const { UsageTrendChart } = await import('./UsageTrendChart');
    const { container } = render(<UsageTrendChart series={series} label="Usage by week" />);
    expect(container.querySelectorAll('path.trend-line')).toHaveLength(2);
    expect(container.querySelectorAll('[data-series="snap"] .trend-dot')).toHaveLength(2);
    expect(container.querySelectorAll('[data-series="tgt"] .trend-dot')).toHaveLength(3);
    expect(container.querySelector('[data-series="snap"] .trend-dot title')!.textContent).toBe('snap %, week 1: 70.0% (60 snaps)');
    expect(screen.getByRole('img', { name: 'Usage by week' })).toBeInTheDocument();
    expect(screen.getAllByText('snap %')).toHaveLength(1);
  });

  it('draws the line at once with reduced motion, and animates it otherwise', async () => {
    const { UsageTrendChart } = await import('./UsageTrendChart');
    const first = render(<UsageTrendChart series={series} label="x" />);
    expect(first.container.querySelector<SVGElement>('path.trend-line')!.style.strokeDashoffset).toBe('');
    first.unmount();
    allowMotion();
    const again = render(<UsageTrendChart series={series} label="x" />);
    const path = again.container.querySelector<SVGElement>('path.trend-line')!;
    expect(path.style.strokeDashoffset).toBe('1');
    await waitFor(() => expect(path.style.strokeDashoffset).toBe('0'));
  });

  it('says so with no values', async () => {
    const { UsageTrendChart } = await import('./UsageTrendChart');
    render(<UsageTrendChart series={[{ id: 'a', label: 'a', color: 'red', points: [{ week: 1, value: null }] }]} label="x" />);
    expect(screen.getByText('no weekly values yet.')).toBeInTheDocument();
  });
});
