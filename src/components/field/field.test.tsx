import { readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSituation } from '../../engine/live';
import type { NflGame } from '../../engine/live';
import { DriveTurf, FieldSituation, MiniField, momentum, placePlays, playContext, playSize, playText } from './index';
import type { DrivePlay } from './index';

afterEach(cleanup);

const meta = (o: Record<string, unknown> = {}) => ({
  possession: 'LAC', yard_line: 44, yard_line_territory: 'KC', down: 2, down_and_distance: '2nd & 7', red_zone: '', away_used_timeouts: 1, home_used_timeouts: 0, ...o,
});
const sit = (o: Record<string, unknown> = {}) => parseSituation(meta(o))!;
const g = (o: Partial<NflGame> = {}): NflGame => ({
  id: 'g', home: 'KC', away: 'LAC', kickoff: Date.parse('2026-10-18T20:25:00Z'), state: 'live', quarter: '4', clock: '14:52', homeScore: 19, awayScore: 6, elapsed: 0.75,
  situation: sit(), ...o,
});

describe('the mini field', () => {
  it('is an image whose label says who has the ball, the down and the spot', () => {
    render(<MiniField game={g()} situation={sit()} />);
    expect(screen.getByRole('img', { name: 'lac on offense, 2nd and 7 at the kc 44' })).toBeInTheDocument();
  });

  it('labels both end zones with the team codes, the visitor on the left', () => {
    const { container } = render(<MiniField game={g()} situation={sit()} />);
    const ez = [...container.querySelectorAll('.art-turf-ez')];
    expect(ez.map((e) => [e.getAttribute('data-side'), e.textContent])).toEqual([['left', 'LAC'], ['right', 'KC']]);
  });

  it('puts the ball at the line of scrimmage (percent of a 120-yard field) and the arrow the way the offense goes', () => {
    // LAC at the KC 44 is x = 56 of 100 yards: (10 + 56) / 120 of the width
    const { container } = render(<MiniField game={g()} situation={sit()} />);
    expect(container.querySelector('.mf-ball')).toHaveStyle({ left: `${(66 / 120) * 100}%` });
    expect(container.querySelector('.mf')).toHaveAttribute('data-dir', 'right');
    expect(container.querySelector('.mf-arrow')).toHaveAttribute('data-dir', 'right');
  });

  it('draws the home team going left', () => {
    const s = sit({ possession: 'KC', yard_line: 30, yard_line_territory: 'KC' });
    const { container } = render(<MiniField game={g()} situation={s} />);
    expect(container.querySelector('.mf')).toHaveAttribute('data-dir', 'left');
    // KC's own 30 is x = 70
    expect(container.querySelector('.mf-ball')).toHaveStyle({ left: `${(80 / 120) * 100}%` });
  });

  it('puts the ball on midfield and at the goal line', () => {
    const mid = render(<MiniField game={g()} situation={sit({ yard_line: 50, yard_line_territory: '' })} />);
    expect(mid.container.querySelector('.mf-ball')).toHaveStyle({ left: '50%' });
    cleanup();
    // LAC on the KC goal line: x = 100, the right edge of the playing field
    const goal = render(<MiniField game={g()} situation={sit({ yard_line: 0, yard_line_territory: 'KC' })} />);
    expect(goal.container.querySelector('.mf-ball')).toHaveStyle({ left: `${(110 / 120) * 100}%` });
  });

  it('tints the red zone in front of the goal being attacked, and only then', () => {
    const open = render(<MiniField game={g()} situation={sit()} />);
    expect(open.container.querySelector('.mf-rz')).toBeNull();
    cleanup();
    const red = render(<MiniField game={g()} situation={sit({ yard_line: 12 })} />);
    expect(red.container.querySelector('.mf')).toHaveAttribute('data-red', 'true');
    // the last 20 yards before x = 100: from (10 + 80) / 120 on, 20 yards wide
    expect(red.container.querySelector('.mf-rz')).toHaveStyle({ left: `${(90 / 120) * 100}%`, width: `${(20 / 120) * 100}%` });
    cleanup();
    const home = render(<MiniField game={g()} situation={sit({ possession: 'KC', yard_line: 8, yard_line_territory: 'LAC' })} />);
    expect(home.container.querySelector('.mf-rz')).toHaveStyle({ left: `${(10 / 120) * 100}%` });
  });

  it('marks the line to gain', () => {
    const { container } = render(<MiniField game={g()} situation={sit()} />);
    // 7 yards past x = 56
    expect(container.querySelector('.mf-line')).toHaveStyle({ left: `${(73 / 120) * 100}%` });
  });

  it('can be decorative when the text beside it says the same', () => {
    render(<MiniField game={g()} situation={sit()} decorative />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows an empty field when there is no ball position', () => {
    const { container } = render(<MiniField game={g()} situation={null} />);
    expect(container.querySelector('.mf-ball')).toBeNull();
    expect(screen.getByRole('img', { name: 'lac at kc, no ball position right now' })).toBeInTheDocument();
  });
});

describe('the situation line', () => {
  it('says a quarterback on the team with the ball is on offense, with the down, the spot, the clock and the timeouts', () => {
    render(<FieldSituation game={g()} team="LAC" pos="QB" />);
    expect(screen.getByText('on offense')).toBeInTheDocument();
    expect(screen.getByText('2nd & 7 · at kc 44')).toBeInTheDocument();
    expect(screen.getByText('q4 14:52')).toBeInTheDocument();
    expect(screen.getByText(/lac 2 timeouts left/)).toBeInTheDocument();
    expect(screen.getByText(/kc 3 timeouts left/)).toBeInTheDocument();
  });

  it('says the other team’s skill player is off the field, and its defense is on defense', () => {
    const { unmount } = render(<FieldSituation game={g()} team="KC" pos="RB" />);
    expect(screen.getByText('off the field')).toBeInTheDocument();
    unmount();
    render(<FieldSituation game={g()} team="KC" pos="DEF" />);
    expect(screen.getByText('on defense')).toBeInTheDocument();
  });

  it('shows the red zone flag', () => {
    render(<FieldSituation game={g({ situation: sit({ yard_line: 9 }) })} team="LAC" pos="WR" />);
    expect(screen.getByText('red zone')).toBeInTheDocument();
  });

  it('gives the mini field the same words as the situation', () => {
    render(<FieldSituation game={g()} team="LAC" pos="QB" />);
    expect(screen.getByRole('img', { name: 'lac on offense, 2nd and 7 at the kc 44' })).toBeInTheDocument();
  });

  it('shows the kickoff time before the game, the score after it, and halftime at the half', () => {
    const { unmount } = render(<FieldSituation game={g({ state: 'pre', quarter: '', clock: '', homeScore: null, awayScore: null, situation: undefined })} />);
    expect(screen.getByText(/lac at kc · \w{3} \d/)).toBeInTheDocument();
    unmount();
    const fin = render(<FieldSituation game={g({ state: 'final', quarter: 'F', clock: '', situation: undefined })} />);
    expect(fin.container).toHaveTextContent('lac 6, kc 19 · final');
    fin.unmount();
    render(<FieldSituation game={g({ quarter: 'HALF', clock: '' })} team="LAC" pos="QB" />);
    expect(screen.getByText('halftime')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('opens the quarter line score from a button', async () => {
    const line = { labels: ['1', '2', '3', '4'], home: [3, 10, 6, 0], away: [0, 6, 0, 0] };
    const user = userEvent.setup();
    render(<FieldSituation game={g({ line })} team="LAC" pos="QB" quarters />);
    const btn = screen.getByRole('button', { name: 'quarters' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    const t = screen.getByRole('table', { name: 'lac at kc, points by quarter' });
    expect(within(t).getByRole('row', { name: /lac 0 6 0 0 6/ })).toBeInTheDocument();
    expect(within(t).getByRole('row', { name: /kc 3 10 6 0 19/ })).toBeInTheDocument();
    expect(within(t).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['team', '1', '2', '3', '4', 'T']);
  });

  it('says when the quarter scores are not available', async () => {
    const user = userEvent.setup();
    render(<FieldSituation game={g()} team="LAC" pos="QB" quarters />);
    await user.click(screen.getByRole('button', { name: 'quarters' }));
    expect(screen.getByText(/quarter scores are not available/)).toBeInTheDocument();
  });

  it('has no buttons on a scoreboard card, which is a button itself', () => {
    render(<FieldSituation game={g()} variant="card" />);
    expect(screen.queryByRole('button')).toBeNull();
    // the field is decorative there; the sentence is screen-reader text
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('lac on offense, 2nd and 7 at the kc 44')).toHaveClass('sr-only');
  });
});

/* ---------- the drive chart on turf ---------- */

const play = (id: string, t: number, points: number, side: DrivePlay['side'], name = 'ja’marr chase', where = 'cin vs pit · q3 8:12'): DrivePlay => ({ id, t, points, side, name, where });

describe('placing plays on the field', () => {
  const plays = [play('c', 30, 3, 'opp'), play('a', 10, 6.4, 'me'), play('b', 20, 1, 'other')];

  it('lays them out left to right in time order, whatever order they arrive in', () => {
    const placed = placePlays(plays);
    expect(placed.map((p) => p.play.id)).toEqual(['a', 'b', 'c']);
    expect(placed[0]!.x).toBeLessThan(placed[1]!.x);
    expect(placed[1]!.x).toBeLessThan(placed[2]!.x);
    // inside the playing field: between the goal lines (10 and 110 of 120 yards)
    expect(placed[0]!.x).toBeGreaterThan((10 / 120) * 100);
    expect(placed[2]!.x).toBeLessThan((110 / 120) * 100);
  });

  it('breaks a tie in time by id, so two plays of one poll never swap places', () => {
    const placed = placePlays([play('z', 5, 1, 'me'), play('y', 5, 1, 'me')]);
    expect(placed.map((p) => p.play.id)).toEqual(['y', 'z']);
    expect(placed[0]!.x).toBeLessThan(placed[1]!.x);
  });

  it('puts one play in the middle', () => {
    expect(placePlays([play('a', 1, 1, 'me')])[0]!.x).toBeCloseTo(50, 5);
  });

  it('rides your plays high, your opponent’s low and the league’s in the middle', () => {
    const y = Object.fromEntries(placePlays(plays).map((p) => [p.play.side, p.y]));
    expect(y.me).toBeLessThan(y.other!);
    expect(y.other).toBeLessThan(y.opp!);
  });

  it('makes a bigger play a bigger marker, with a floor and a ceiling', () => {
    expect(playSize('me', 20)).toBeGreaterThan(playSize('me', 2));
    expect(playSize('me', 0.1)).toBeGreaterThanOrEqual(14);
    expect(playSize('me', 500)).toBeLessThanOrEqual(30);
    expect(playSize('other', 20)).toBeLessThan(playSize('me', 2));
    expect(playSize('me', -6)).toBe(playSize('me', 6));
  });

  it('places nothing when there are no plays', () => {
    expect(placePlays([])).toEqual([]);
  });
});

describe('the momentum line', () => {
  it('runs above the midline when you are ahead and below it when you are behind', () => {
    const ahead = momentum([play('a', 1, 6, 'me'), play('b', 2, 2, 'opp')], 4);
    expect(ahead[ahead.length - 1]!.margin).toBe(4);
    expect(ahead[ahead.length - 1]!.y).toBeLessThan(50);
    const behind = momentum([play('a', 1, 2, 'me'), play('b', 2, 6, 'opp')], -4);
    expect(behind[behind.length - 1]!.y).toBeGreaterThan(50);
  });

  it('is anchored to the scoreboard: the margin before the visit is the margin now minus what the visit saw', () => {
    // you lead by 10 now, and this visit saw you score 6 and them score 2, so you led by 6 when it began
    const line = momentum([play('a', 1, 6, 'me'), play('b', 2, 2, 'opp')], 10);
    expect(line.map((p) => p.margin)).toEqual([6, 12, 10, 10]);
  });

  it('moves up on your play and down on theirs, and not at all on the rest of the league’s', () => {
    const line = momentum([play('a', 1, 6, 'me'), play('b', 2, 9, 'other'), play('c', 3, 8, 'opp')], 0);
    const ys = line.map((p) => p.y);
    // start, after a, after b, after c, end
    expect(ys[1]).toBeLessThan(ys[0]!);
    expect(ys[2]).toBe(ys[1]);
    expect(ys[3]).toBeGreaterThan(ys[2]!);
  });

  it('goes left to right', () => {
    const xs = momentum([play('a', 1, 6, 'me'), play('b', 2, 2, 'opp')], 4).map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('is flat at the margin with no plays', () => {
    const line = momentum([], 7);
    expect(new Set(line.map((p) => p.y)).size).toBe(1);
    expect(line[0]!.y).toBeLessThan(50);
  });
});

describe('the drive chart', () => {
  const plays = [play('a', 1, 6.4, 'me', 'ja’marr chase'), play('b', 2, 3, 'opp', 'josh allen', 'buf vs det · q2 1:00'), play('c', 3, -2, 'me', 'tee higgins', 'cin vs pit · q4 3:00'), play('d', 4, 0.8, 'other', 'ceedee lamb', 'dal vs was · q1 9:10')];
  const field = (p: readonly DrivePlay[] = plays, margin: number | null = 4.4, mode: 'live' | 'top' = 'live') => render(<DriveTurf plays={p} meName="icemen" oppName="killa k" margin={margin} mode={mode} />);

  it('is a turf field with the two fantasy teams in the end zones', () => {
    const { container } = field();
    expect(container.querySelector('.art-turf')).not.toBeNull();
    expect([...container.querySelectorAll('.art-turf-ez')].map((e) => [e.getAttribute('data-side'), e.textContent])).toEqual([['left', 'icemen'], ['right', 'killa k']]);
  });

  it('draws one football per play, coloured by whose it is, in time order', () => {
    const { container } = field();
    const marks = [...container.querySelectorAll('.dt-mark')];
    expect(marks.map((m) => m.getAttribute('data-side'))).toEqual(['me', 'opp', 'me', 'other']);
    const lefts = marks.map((m) => parseFloat((m as HTMLElement).style.left));
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
  });

  it('draws a correction as a hollow ball and a bigger play as a wider one', () => {
    const { container } = field();
    const marks = [...container.querySelectorAll<HTMLElement>('.dt-mark')];
    expect(marks[2]).toHaveAttribute('data-neg', 'true');
    expect(marks[0]).not.toHaveAttribute('data-neg');
    expect(parseFloat(marks[0]!.style.width)).toBeGreaterThan(parseFloat(marks[1]!.style.width));
  });

  it('names each play by its points first, then the player, game and clock', () => {
    field();
    expect(screen.getByRole('button', { name: '+6.4 ja’marr chase, cin vs pit, q3 8:12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+3.0 josh allen, buf vs det, q2 1:00' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '−2.0 tee higgins, cin vs pit, q4 3:00' })).toBeInTheDocument();
  });

  it('reads a play on tap, and again on a second tap puts it away', async () => {
    const user = userEvent.setup();
    const { container } = field();
    expect(container.querySelector('.dt-tip')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^\+6\.4/ }));
    expect(container.querySelector('.dt-tip')).toHaveTextContent('+6.4 · ja’marr chase · cin vs pit · q3 8:12');
    await user.click(screen.getByRole('button', { name: /^\+6\.4/ }));
    await user.unhover(screen.getByRole('button', { name: /^\+6\.4/ }));
    expect(container.querySelector('.dt-tip')).toBeNull();
  });

  it('reads a play on hover and on keyboard focus', async () => {
    const user = userEvent.setup();
    const { container } = field();
    await user.hover(screen.getByRole('button', { name: /^\+3\.0/ }));
    expect(container.querySelector('.dt-tip')).toHaveTextContent('+3.0 · josh allen');
    await user.unhover(screen.getByRole('button', { name: /^\+3\.0/ }));
    expect(container.querySelector('.dt-tip')).toBeNull();
    await user.tab();
    expect(container.querySelector('.dt-tip')).toHaveTextContent('+6.4 · ja’marr chase');
  });

  it('highlights the newest play with a drive arrow that is hidden from assistive tech', () => {
    const { container } = field();
    expect(container.querySelectorAll('.dt-mark[data-latest="true"]')).toHaveLength(1);
    expect(container.querySelector('.dt-mark[data-latest="true"]')).toHaveAccessibleName(/^\+0\.8 ceedee lamb/);
    expect(container.querySelector('svg.dt-drive')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the momentum line only when there is a margin to anchor it', () => {
    expect(field().container.querySelector('.dt-margin')).not.toBeNull();
    cleanup();
    expect(field(plays, null).container.querySelector('.dt-margin')).toBeNull();
  });

  it('has no newest play and no momentum line when it shows a finished week’s top plays', () => {
    const { container } = field(plays, 4.4, 'top');
    expect(container.querySelector('.dt-drive')).toBeNull();
    expect(container.querySelector('.dt-margin')).toBeNull();
    expect(container.querySelector('.dt-mark[data-latest]')).toBeNull();
  });

  it('summarises itself for a screen reader and says which way the line reads', () => {
    const { container } = field();
    expect(container.querySelector('figcaption')).toHaveTextContent('4 scoring updates, oldest at the left end zone: icemen 2, killa k 1, the rest of the league 1.');
    expect(container.querySelector('.dt-ahead')).toHaveTextContent('icemen ahead by 4.4, above the midline is icemen');
  });

  it('words a play for the hover and for the screen reader', () => {
    expect(playText(plays[0]!)).toBe('+6.4 · ja’marr chase · cin vs pit · q3 8:12');
    expect(playContext(plays[0]!)).toBe('ja’marr chase, cin vs pit, q3 8:12');
  });

  it('keeps its drive arrow still under reduced motion: the animation is only set when motion is allowed', () => {
    const css = readFileSync(`${process.cwd()}/src/components/field/field.css`, 'utf8');
    const motion = css.match(/@media \(prefers-reduced-motion: no-preference\) \{[^}]*dt-push[^}]*\}/);
    expect(motion).not.toBeNull();
    // and not outside it
    expect(css.replace(motion![0], '')).not.toMatch(/animation: dt-push/);
  });
});
