import { useContext, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { DataContext } from '../app/dataContext';
import { isDeep, teamColors } from '../engine/nfl/teamColors';
import { HEADSHOT_URL, initialsOf } from './avatarUtils';
import './avatar.css';

export type AvatarSize = 20 | 28 | 40 | 56;

interface Props {
  /** Sleeper player id; for a team defense it is the team abbreviation ("KC") */
  pid: string;
  /** the visible name (initials come from it; the avatar itself is decorative) */
  name: string;
  pos?: string;
  size?: AvatarSize;
  /** the player's NFL team (Sleeper's abbreviation): his circle and ring take its colours. Left out, it is looked up from the players file when that is
      already loaded; a free agent with no team stays neutral. For a team defense it is the defense's abbreviation when `pid` is not it. */
  team?: string;
  className?: string;
}

const noop = () => () => {};
const zero = () => 0;

/** The player's team when the caller did not pass one: read from the players file if the app has already loaded it. It never starts a fetch (the
    pages that need the file load it), so an avatar on a page without it simply stays neutral. Outside a data provider (a unit test) it is null. */
function useTeamFromFile(pid: string, wanted: boolean): string | null {
  const ctx = useContext(DataContext);
  const store = wanted ? ctx?.store : undefined;
  useSyncExternalStore(store?.subscribe ?? noop, store?.getVersion ?? zero);
  if (!store) return null;
  const team = store.get<Record<string, { team?: unknown }>>('sleeper-players')?.data?.[pid]?.team;
  return typeof team === 'string' ? team : null;
}

/** A player's headshot as a round crop on his team's colour (a ring in the second colour), or an initials monogram on that colour when the image
    fails or is offline. A free agent with no team is neutral. Team defenses (`pos` "DEF") never fetch an image (no NFL marks): they are always a
    monogram of the team abbreviation. Decorative: it sits beside the visible name, so the image has `alt=""` and the monogram is hidden from readers. */
export function Avatar({ pid, name, pos, size = 28, team, className }: Props) {
  // remember which id failed, so a new id (a re-sorted row) gets a fresh try
  const [failed, setFailed] = useState<string | null>(null);
  const isDef = pos === 'DEF';
  // Sleeper ids for players are numeric; anything else has no thumbnail, so do not ask the CDN for one
  const hasImage = !isDef && /^\d+$/.test(pid) && failed !== pid;
  const fromFile = useTeamFromFile(pid, !team && !isDef);
  const abbr = isDef ? (team ?? pid) : team ?? fromFile;
  const colors = teamColors(abbr);
  const style = colors ? ({ '--av-bg': colors.primary, '--av-ring': colors.secondary, '--av-fg': colors.text } as CSSProperties) : undefined;
  const cls = `avatar${colors && isDeep(colors) ? ' avatar-edge' : ''}${className ? ` ${className}` : ''}`;

  if (!hasImage) {
    const text = isDef ? (team ?? pid).toUpperCase().slice(0, 3) : initialsOf(name);
    return (
      <span className={cls} style={style} data-size={size} data-kind="monogram" data-pos={pos} data-team={colors ? abbr?.toUpperCase() : undefined} aria-hidden="true">{text}</span>
    );
  }
  return (
    <span className={cls} style={style} data-size={size} data-kind="photo" data-pos={pos} data-team={colors ? abbr?.toUpperCase() : undefined} aria-hidden="true">
      <img
        className="avatar-img" src={HEADSHOT_URL(pid)} alt="" width={size} height={size}
        loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false}
        onError={() => setFailed(pid)}
      />
    </span>
  );
}

interface StackPlayer { pid: string; name: string; pos?: string; team?: string }
interface StackProps {
  players: StackPlayer[];
  size?: AvatarSize;
  /** show at most this many, then a "+n" circle */
  max?: number;
  /** an accessible name for the group when no visible text names these players */
  label?: string;
}

/** Overlapping avatars, each cut from its neighbour by a 2 px paper ring (3 px at 40 and 56). */
export function AvatarStack({ players, size = 28, max = 4, label }: StackProps) {
  const shown = players.slice(0, max);
  const more = players.length - shown.length;
  return (
    <span
      className="avatar-stack" data-size={size}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    >
      {shown.map((p) => <Avatar key={p.pid} pid={p.pid} name={p.name} pos={p.pos} team={p.team} size={size} />)}
      {more > 0 && <span className="avatar avatar-more" data-size={size} data-kind="monogram" aria-hidden="true">+{more}</span>}
    </span>
  );
}

interface NameProps extends Omit<Props, 'className'> {
  /** the visible name, usually a `PlayerLink`, plus any tags */
  children: ReactNode;
}

/** An avatar and a name on one line: the pattern every table uses. The accessible name stays the visible name (the avatar is decorative). */
export function AvatarName({ children, ...avatar }: NameProps) {
  return (
    <span className="avatar-name">
      <Avatar {...avatar} size={avatar.size ?? 28} />
      <span>{children}</span>
    </span>
  );
}
