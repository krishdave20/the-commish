import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar, AvatarStack } from './Avatar';
import { HEADSHOT_URL, initialsOf } from './avatarUtils';

afterEach(cleanup);

describe('Avatar', () => {
  it('shows the Sleeper thumbnail for a player, lazy, async and sized so nothing shifts', () => {
    const { container } = render(<Avatar pid="4034" name="justin jefferson" pos="WR" size={28} />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'https://sleepercdn.com/content/nfl/players/thumb/4034.jpg');
    expect(img).toHaveAttribute('src', HEADSHOT_URL('4034'));
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(img).toHaveAttribute('width', '28');
    expect(img).toHaveAttribute('height', '28');
  });

  it('is decorative: an empty alt, and nothing for a screen reader to announce', () => {
    const { container } = render(<Avatar pid="4034" name="justin jefferson" pos="WR" />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('falls back to an initials monogram when the image fails (offline or a 404)', () => {
    const { container } = render(<Avatar pid="4034" name="justin jefferson" pos="WR" size={40} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    const el = container.firstElementChild!;
    expect(el).toHaveTextContent('JJ');
    expect(el).toHaveAttribute('data-kind', 'monogram');
    expect(el).toHaveAttribute('data-size', '40');
  });

  it('gives a failed id a fresh try when the row shows another player', () => {
    const { container, rerender } = render(<Avatar pid="1" name="a b" pos="WR" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    rerender(<Avatar pid="2" name="c d" pos="WR" />);
    expect(container.querySelector('img')).toHaveAttribute('src', HEADSHOT_URL('2'));
  });

  it('never requests an image for a team defense: a monogram of the team abbreviation', () => {
    const { container } = render(<Avatar pid="KC" name="kansas city defense" pos="DEF" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild).toHaveTextContent('KC');
    expect(container.firstElementChild).toHaveAttribute('data-pos', 'DEF');
    // even with a numeric-looking id, a defense stays a monogram
    const other = render(<Avatar pid="123" team="sf" name="49ers" pos="DEF" />);
    expect(other.container.querySelector('img')).toBeNull();
    expect(other.container.firstElementChild).toHaveTextContent('SF');
  });

  it('skips the request for an id the CDN cannot have (not numeric)', () => {
    const { container } = render(<Avatar pid="abc" name="free agent" pos="WR" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild).toHaveTextContent('FA');
  });

  it('defaults to 28 px', () => {
    const { container } = render(<Avatar pid="1" name="a b" />);
    expect(container.firstElementChild).toHaveAttribute('data-size', '28');
  });
});

describe('initialsOf', () => {
  it('reads first and last name, ignoring punctuation and suffixes', () => {
    expect(initialsOf('justin jefferson')).toBe('JJ');
    expect(initialsOf("d.k. metcalf")).toBe('DM');
    expect(initialsOf('kenneth walker iii')).toBe('KW');
    expect(initialsOf('madonna')).toBe('MA');
    expect(initialsOf('')).toBe('·');
  });
});

describe('AvatarStack', () => {
  const players = [
    { pid: '1', name: 'a one', pos: 'QB' }, { pid: '2', name: 'b two', pos: 'RB' },
    { pid: '3', name: 'c three', pos: 'WR' }, { pid: '4', name: 'd four', pos: 'TE' }, { pid: '5', name: 'e five', pos: 'WR' },
  ];

  it('overlaps its avatars and shows a +n circle past the max', () => {
    const { container } = render(<AvatarStack players={players} max={3} size={20} />);
    const stack = container.querySelector('.avatar-stack')!;
    expect(stack).toHaveAttribute('data-size', '20');
    expect(stack.querySelectorAll('img')).toHaveLength(3);
    expect(stack.querySelector('.avatar-more')).toHaveTextContent('+2');
  });

  it('is hidden from readers unless it is given a label', () => {
    const a = render(<AvatarStack players={players.slice(0, 2)} />);
    expect(a.container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    cleanup();
    const b = render(<AvatarStack players={players.slice(0, 2)} label="a one and b two" />);
    expect(b.container.firstElementChild).toHaveAttribute('role', 'img');
    expect(b.container.firstElementChild).toHaveAttribute('aria-label', 'a one and b two');
  });

  it('shows no +n circle when everyone fits', () => {
    const { container } = render(<AvatarStack players={players.slice(0, 2)} max={4} />);
    expect(container.querySelector('.avatar-more')).toBeNull();
  });
});
