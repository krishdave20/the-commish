import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WinMeter } from '../../pages/gameday/WinMeter';
import { BallSpiral } from './BallSpiral';
import { DriveField } from './DriveField';
import { placeMarks } from './drive';
import type { DriveMark } from './drive';
import {
  CommissionersOffice, FieldStrip, Football, Goalposts, Helmet, Megaphone, PlayDiagram, StadiumLights, Trophy, Whistle,
} from './index';
import { Uprights } from './Uprights';
import { YardTrack } from './YardTrack';
import { fieldPct, yardLabel, yardOf } from './field';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** jsdom has no matchMedia, which counts as reduced motion; this says the viewer is fine with motion */
const allowMotion = () => vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('no-preference'), media: q, addEventListener() {}, removeEventListener() {} }));

const PIECES = [
  ['Football', Football], ['Goalposts', Goalposts], ['FieldStrip', FieldStrip], ['PlayDiagram', PlayDiagram], ['Whistle', Whistle],
  ['Trophy', Trophy], ['Megaphone', Megaphone], ['StadiumLights', StadiumLights], ['Helmet', Helmet], ['CommissionersOffice', CommissionersOffice],
] as const;

describe('the illustration set', () => {
  it.each(PIECES)('%s is a labelled image when given a title', (name, Piece) => {
    const { container } = render(<Piece title={`a ${name}`} />);
    const img = screen.getByRole('img', { name: `a ${name}` });
    expect(img.querySelector('title')).toHaveTextContent(`a ${name}`);
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-hidden');
  });

  it.each(PIECES)('%s is hidden from assistive tech without a title', (_name, Piece) => {
    const { container } = render(<Piece />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
    expect(svg.querySelector('title')).toBeNull();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each(PIECES)('%s takes a size and a class and keeps its proportions', (_name, Piece) => {
    const { container } = render(<Piece size={100} className="mine" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveClass('art', 'mine');
    expect(svg).toHaveAttribute('width', '100');
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(Number(svg.getAttribute('height'))).toBeCloseTo((100 * h!) / w!, 1);
  });

  it('draws with the current colour, round caps and no marks beyond a fine line', () => {
    const { container } = render(<Trophy />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('stroke-linecap', 'round');
    expect(svg).toHaveAttribute('stroke-linejoin', 'round');
    expect(Number(svg.getAttribute('stroke-width'))).toBeLessThanOrEqual(1.5);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe('field geometry', () => {
  it('puts 50% at midfield and 80% on the other team’s 20', () => {
    expect(yardOf(0.5)).toBe(50);
    expect(yardOf(0.8)).toBe(80);
    expect(yardOf(0.2)).toBe(20);
    expect(fieldPct(50)).toBe(50);
    expect(yardLabel(80, 'icemen', 'killa')).toBe('killa’s 20');
    expect(yardLabel(20, 'icemen', 'killa')).toBe('icemen’s 20');
    expect(yardLabel(50, 'icemen', 'killa')).toBe('midfield');
  });
});

describe('the yard track', () => {
  it('shows real progress: the ball sits at the yard that matches done of total', () => {
    render(<YardTrack label="Refreshing data" progress={{ done: 2, total: 4 }} />);
    const bar = screen.getByRole('progressbar', { name: 'Refreshing data' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(bar).toHaveAttribute('data-mode', 'determinate');
    // halfway done is midfield
    expect(bar.querySelector('.yard-ball')).toHaveStyle({ left: '50%' });
    expect(bar.querySelector('.yard-fill')).toHaveStyle({ width: '50%' });
  });

  it('moves the ball toward the right end zone as the work gets done', () => {
    const { rerender } = render(<YardTrack label="x" progress={{ done: 1, total: 10 }} />);
    const left = () => parseFloat((screen.getByRole('progressbar').querySelector('.yard-ball') as HTMLElement).style.left);
    const first = left();
    rerender(<YardTrack label="x" progress={{ done: 9, total: 10 }} />);
    expect(left()).toBeGreaterThan(first);
    expect(left()).toBeLessThan(100);
  });

  it('rolls between the 20s when the progress is not known', () => {
    allowMotion();
    render(<YardTrack label="Refreshing data" />);
    const bar = screen.getByRole('progressbar', { name: 'Refreshing data' });
    expect(bar).toHaveAttribute('data-mode', 'indeterminate');
    expect(bar).toHaveAttribute('data-motion', 'moving');
    expect(bar).toHaveAttribute('aria-valuetext', 'Refreshing');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    // the CSS animation owns the ball's position
    expect((bar.querySelector('.yard-ball') as HTMLElement).style.left).toBe('');
  });

  it('stands still with reduced motion: midfield when unknown, the current yard when known', () => {
    const { unmount } = render(<YardTrack label="x" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('data-motion', 'still');
    expect(bar.querySelector('.yard-ball')).toHaveStyle({ left: '50%' });
    unmount();
    render(<YardTrack label="x" progress={{ done: 1, total: 2 }} />);
    expect(screen.getByRole('progressbar').querySelector('.yard-ball')).toHaveStyle({ left: '50%' });
  });
});

describe('the win-meter field', () => {
  const ball = (c: HTMLElement) => c.querySelector('.art-ball') as HTMLElement;

  it.each([[0.5, '50', 'midfield', '50%'], [0.8, '80', 'Reed’s 20', '80%'], [0.2, '20', 'Sunday’s 20', '20%']])(
    'puts the ball on the yard for a %s win chance and keeps the labels',
    (p, yard, where, pct) => {
      const { container } = render(<WinMeter leftName="Sunday" rightName="Reed" leftIsMe p={p} pre={0.5} />);
      expect(ball(container)).toHaveAttribute('data-yard', yard);
      // the percentage rides above the ball, the sentence says it in words, the image says it to assistive tech
      expect(screen.getByText(pct)).toBeInTheDocument();
      expect(screen.getByText(`you win ${Math.round(p * 100)} of every 100 simulations from here`)).toBeInTheDocument();
      const img = screen.getByRole('img');
      expect(img).toHaveAccessibleName(new RegExp(`Sunday ${pct} to win, Reed ${Math.round((1 - p) * 100)}%; before kickoff Sunday was 50%. the ball is on ${where}`));
      // the ball's left edge is the yard's share of the 120-yard field
      expect(ball(container)).toHaveStyle({ left: `${fieldPct(Number(yard))}%` });
    },
  );

  it('names the end zones, numbers the yard lines and marks where it stood before kickoff', () => {
    const { container } = render(<WinMeter leftName="Sunday" rightName="Reed" p={0.7} pre={0.4} />);
    expect(container.querySelectorAll('.art-turf-ez')).toHaveLength(2);
    expect(container.querySelector('.art-turf-nums')!.textContent).toBe('102030405040302010');
    expect(container.querySelector('.art-tick')).toHaveStyle({ left: `${fieldPct(40)}%` });
    expect(screen.getByText('Sunday wins 70 of every 100 simulations from here')).toBeInTheDocument();
  });

  it('says the result when the game is over and puts the ball in the winner’s end zone', () => {
    const { container } = render(<WinMeter leftName="Sunday" rightName="Reed" p={1} pre={0.4} final />);
    expect(screen.getByRole('img', { name: 'final: Sunday won' })).toBeInTheDocument();
    expect(ball(container)).toHaveAttribute('data-yard', '105');
    expect(container.querySelector('.art-tick')).toBeNull();
  });

  it('eases in from midfield when motion is allowed', () => {
    allowMotion();
    const { container } = render(<WinMeter leftName="a" rightName="b" p={0.8} pre={0.5} />);
    // first frame: midfield; the spring in the stylesheet carries it from there (jsdom does not run the animation frame)
    expect(ball(container)).toHaveStyle({ left: '50%' });
  });
});

describe('the drive-chart field', () => {
  const mark = (id: string, t: number, points: number, side: DriveMark['side']): DriveMark => ({ id, t, points, side });
  const marks = [mark('c', 30, 6.4, 'me'), mark('b', 20, 2, 'opp'), mark('a', 10, 0.8, 'other'), mark('d', 40, -1.2, 'me')];

  it('draws one mark per play, with a label that counts them', () => {
    const { container } = render(<DriveField marks={marks} meName="Sunday" oppName="Reed" />);
    expect(container.querySelectorAll('[data-mark]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-mark="me"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-mark="opp"]')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAccessibleName(/^4 scoring updates, oldest at the left: Sunday 2 \(5\.2 points\), Reed 1 \(2\.0\), the rest of the league 1$/);
    expect(container.querySelector('[data-neg="true"]')).toBeInTheDocument();
  });

  it('places the plays in time order from left to right and sizes them by points', () => {
    const placed = placeMarks(marks);
    expect(placed.map((p) => p.mark.id)).toEqual(['a', 'b', 'c', 'd']);
    const xs = placed.map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(xs[0]).toBeGreaterThan(8);
    expect(xs[3]).toBeLessThan(92);
    const size = (id: string) => placed.find((p) => p.mark.id === id)!.d;
    expect(size('c')).toBeGreaterThan(size('b'));
  });

  it('spreads plays that share a moment and a lane, and handles a single play', () => {
    const same = placeMarks([mark('x', 5, 1, 'me'), mark('y', 5, 1, 'me'), mark('z', 5, 1, 'me')]);
    expect(new Set(same.map((p) => p.x)).size).toBe(3);
    expect(placeMarks([mark('x', 5, 1, 'me')])).toHaveLength(1);
    expect(placeMarks([])).toEqual([]);
  });
});

describe('the small moments', () => {
  it('uprights rise once with motion and simply stand with reduced motion', () => {
    allowMotion();
    const { container, unmount } = render(<Uprights />);
    expect(container.querySelector('.art-uprights')).toHaveAttribute('data-motion', 'play');
    unmount();
    vi.unstubAllGlobals();
    const reduced = render(<Uprights />);
    expect(reduced.container.querySelector('.art-uprights')).toHaveAttribute('data-motion', 'still');
    expect(reduced.container.querySelector('.art-uprights')).toHaveAttribute('aria-hidden', 'true');
    expect(reduced.container.querySelector('svg')).toBeInTheDocument();
  });

  it('the ball spirals only when asked and only when motion is allowed, and is always shown at rest after', () => {
    const rest = render(<BallSpiral />);
    expect(rest.container.querySelector('.art-spiral')).toHaveAttribute('data-motion', 'still');
    rest.unmount();
    // reduced motion: even a draft that just finished does not move
    const reduced = render(<BallSpiral play />);
    expect(reduced.container.querySelector('.art-spiral')).toHaveAttribute('data-motion', 'still');
    expect(reduced.container.querySelector('svg')).toBeInTheDocument();
    reduced.unmount();
    allowMotion();
    const moving = render(<BallSpiral play />);
    expect(moving.container.querySelector('.art-spiral')).toHaveAttribute('data-motion', 'play');
  });
});
