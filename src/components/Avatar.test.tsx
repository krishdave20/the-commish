import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Avatar, AvatarStack } from './Avatar';
import { DataContext } from '../app/dataContext';
import type { DataContextValue } from '../app/dataContext';
import { ResourceStore } from '../app/resourceStore';
import { TEAM_COLORS } from '../engine/nfl/teamColors';
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

const prop = (el: Element | null, name: string) => (el as HTMLElement).style.getPropertyValue(name);

describe('Avatar colours', () => {
  it('puts the headshot on the team primary, with a ring in the secondary', () => {
    const { container } = render(<Avatar pid="4034" name="justin jefferson" pos="WR" team="KC" />);
    const el = container.firstElementChild!;
    expect(prop(el, '--av-bg')).toBe(TEAM_COLORS.KC!.primary);
    expect(prop(el, '--av-ring')).toBe(TEAM_COLORS.KC!.secondary);
    expect(el).toHaveAttribute('data-team', 'KC');
    expect(el).toHaveAttribute('data-kind', 'photo');
  });

  it('takes the colours of an old team code, and of a lower-case one', () => {
    const { container } = render(<Avatar pid="1" name="a b" team="jac" />);
    expect(prop(container.firstElementChild, '--av-bg')).toBe(TEAM_COLORS.JAX!.primary);
  });

  it('draws the monogram fallback in the readable text colour on the team primary', () => {
    const { container } = render(<Avatar pid="4034" name="justin jefferson" pos="WR" team="PIT" />);
    fireEvent.error(container.querySelector('img')!);
    const el = container.firstElementChild!;
    expect(el).toHaveTextContent('JJ');
    expect(prop(el, '--av-bg')).toBe(TEAM_COLORS.PIT!.primary);
    expect(prop(el, '--av-fg')).toBe(TEAM_COLORS.PIT!.text);
    expect(prop(el, '--av-fg')).toBe('#000000'); // black reads on gold
  });

  it('colours a team defense by its own abbreviation, with no logo and no request', () => {
    const { container } = render(<Avatar pid="NE" name="new england defense" pos="DEF" />);
    const el = container.firstElementChild!;
    expect(container.querySelector('img')).toBeNull();
    expect(el).toHaveTextContent('NE');
    expect(prop(el, '--av-bg')).toBe(TEAM_COLORS.NE!.primary);
    expect(prop(el, '--av-ring')).toBe(TEAM_COLORS.NE!.secondary);
    expect(prop(el, '--av-fg')).toBe('#ffffff');
    // a defense passed by a numeric id still takes the colours of `team`
    const other = render(<Avatar pid="123" team="sf" name="49ers" pos="DEF" />);
    expect(prop(other.container.firstElementChild, '--av-bg')).toBe(TEAM_COLORS.SF!.primary);
  });

  it('stays neutral for a free agent with no team (the stylesheet falls back to --rule and --ink-2)', () => {
    for (const team of [undefined, 'FA', '']) {
      const { container, unmount } = render(<Avatar pid="abc" name="free agent" pos="WR" team={team} />);
      const el = container.firstElementChild!;
      expect(el).not.toHaveAttribute('style');
      expect(el).not.toHaveAttribute('data-team');
      expect(el).not.toHaveClass('avatar-edge');
      unmount();
    }
  });

  it('adds a faint outer edge for a dark team, so navy does not vanish on the dark appearance', () => {
    const navy = render(<Avatar pid="1" name="a b" team="NE" />);
    expect(navy.container.firstElementChild).toHaveClass('avatar-edge');
    const red = render(<Avatar pid="1" name="a b" team="KC" />);
    expect(red.container.firstElementChild).not.toHaveClass('avatar-edge');
  });

  it('keeps a passed class beside its own', () => {
    const { container } = render(<Avatar pid="1" name="a b" team="NE" className="x" />);
    expect(container.firstElementChild).toHaveClass('avatar', 'avatar-edge', 'x');
  });
});

describe('Avatar team lookup', () => {
  it('reads the team from the players file once the app has loaded it, and never starts a fetch of its own', async () => {
    const store = new ResourceStore();
    const value = { store } as unknown as DataContextValue;
    const { container } = render(<DataContext.Provider value={value}><Avatar pid="4034" name="justin jefferson" pos="WR" /></DataContext.Provider>);
    // nothing loaded yet: neutral, and no entry was requested
    expect(container.firstElementChild).not.toHaveAttribute('style');
    expect(store.get('sleeper-players')).toBeUndefined();
    await act(async () => { await store.load('sleeper-players', async () => ({ data: { '4034': { team: 'KC' } }, asOf: 1, fromCache: false, stale: false })); });
    expect(prop(container.firstElementChild, '--av-bg')).toBe(TEAM_COLORS.KC!.primary);
    expect(container.firstElementChild).toHaveAttribute('data-team', 'KC');
  });

  it('prefers the team it was given over the file', async () => {
    const store = new ResourceStore();
    await store.load('sleeper-players', async () => ({ data: { '4034': { team: 'KC' } }, asOf: 1, fromCache: false, stale: false }));
    const value = { store } as unknown as DataContextValue;
    const { container } = render(<DataContext.Provider value={value}><Avatar pid="4034" name="justin jefferson" pos="WR" team="NE" /></DataContext.Provider>);
    expect(prop(container.firstElementChild, '--av-bg')).toBe(TEAM_COLORS.NE!.primary);
  });
});

describe('Avatar sizes', () => {
  it('offers 20, 28, 40 and a 56 px hero size, always a fixed box', () => {
    for (const size of [20, 28, 40, 56] as const) {
      const { container, unmount } = render(<Avatar pid="4034" name="justin jefferson" team="KC" size={size} />);
      expect(container.firstElementChild).toHaveAttribute('data-size', String(size));
      expect(container.querySelector('img')).toHaveAttribute('width', String(size));
      expect(container.querySelector('img')).toHaveAttribute('height', String(size));
      unmount();
    }
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

  it('colours each avatar from its own team, and leaves the +n circle neutral', () => {
    const colored = [
      { pid: '1', name: 'a one', pos: 'QB', team: 'KC' }, { pid: '2', name: 'b two', pos: 'RB', team: 'NE' }, { pid: '3', name: 'c three', pos: 'WR', team: 'SF' },
    ];
    const { container } = render(<AvatarStack players={colored} max={2} size={40} />);
    const [a, b] = [...container.querySelectorAll('.avatar:not(.avatar-more)')];
    expect(prop(a!, '--av-bg')).toBe(TEAM_COLORS.KC!.primary);
    expect(prop(b!, '--av-bg')).toBe(TEAM_COLORS.NE!.primary);
    expect(container.querySelector('.avatar-more')).not.toHaveAttribute('style');
  });

  it('cuts each circle from its neighbour with a paper ring (3 px at 40 and 56), set in the stylesheet from tokens', () => {
    const css = readFileSync(resolve(__dirname, 'avatar.css'), 'utf8');
    expect(css).toMatch(/\.avatar-stack > \.avatar \{ box-shadow: 0 0 0 var\(--av-gap\) var\(--av-cut\); \}/);
    expect(css).toMatch(/--av-cut: var\(--av-cut-bg, var\(--paper\)\)/);
    expect(css).toMatch(/--av-gap: 2px/);
    expect(css).toMatch(/avatar-stack\[data-size='40'\], \.avatar-stack\[data-size='56'\] \{ --av-gap: 3px/);
    // dark mode follows through the token, and nothing here writes a literal colour
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('stacks at 56 px', () => {
    const { container } = render(<AvatarStack players={players.slice(0, 2)} size={56} />);
    expect(container.querySelector('.avatar-stack')).toHaveAttribute('data-size', '56');
    expect(container.querySelectorAll('.avatar[data-size="56"]')).toHaveLength(2);
  });

  it('shows no +n circle when everyone fits', () => {
    const { container } = render(<AvatarStack players={players.slice(0, 2)} max={4} />);
    expect(container.querySelector('.avatar-more')).toBeNull();
  });
});
