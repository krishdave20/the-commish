/* What the score ticker shows, as plain data: one item per matchup (mine first) and one per NFL game. */
import { formatOdds } from '../../app/format';
import type { LiveView, MatchupLive, NflGame } from '../../engine/live';
import { gameStatusText, isPreGame } from '../../engine/live';
import { formatKickoff } from '../../app/live/format';

export interface TickerItem {
  key: string;
  matchupId: number;
  mine: boolean;
  left: string;
  right: string;
  leftScore: string;
  rightScore: string;
  /** which side is ahead (null when level or nothing has happened) */
  lead: 'left' | 'right' | null;
  /** the favorite's win chance, "68%"; null once the matchup is decided */
  pct: string | null;
  /** which team the percentage belongs to: it is drawn next to that team's name */
  fav: 'left' | 'right';
  pctTone: 'ok' | 'warn' | 'bad';
  note: string;
  /** the screen reader's version of the whole item */
  label: string;
  /** the scores are projections, not points */
  projected: boolean;
}

const score = (n: number) => n.toFixed(1);

export function tickerItem(m: MatchupLive, projected: boolean): TickerItem {
  const l = m.a, r = m.b;
  const ls = projected ? l.projection : l.actual, rs = projected ? r.projection : r.actual;
  const decided = m.final && !projected;
  const lead = Math.abs(ls - rs) < 0.005 ? null : ls > rs ? 'left' : 'right';
  const p = m.winA;
  const note = projected ? 'projected' : m.final ? 'final' : `${m.left} left`;
  const fav = p >= 0.5 ? 'left' : 'right';
  const favP = Math.max(p, 1 - p);
  const pct = decided ? null : formatOdds(favP);
  // the colour says how safe the favorite is; for the underdog side of my own matchup it turns red
  const tone = (l.isMe || r.isMe) && !(l.isMe ? p >= 0.5 : p < 0.5) ? 'bad' : favP >= 0.65 ? 'ok' : 'warn';
  const label = [
    `${l.name} ${score(ls)}${projected ? ' projected' : ''}, ${r.name} ${score(rs)}`,
    decided ? (lead === 'left' ? `${l.name} won` : lead === 'right' ? `${r.name} won` : 'tied') : `${fav === 'left' ? l.name : r.name} ${pct} to win`,
    projected ? null : m.final ? 'final' : `${m.left} starters left`,
  ].filter(Boolean).join(', ');
  return {
    key: `m${m.id}`, matchupId: m.id, mine: l.isMe || r.isMe, left: l.name, right: r.name,
    leftScore: score(ls), rightScore: score(rs), lead, pct, fav, pctTone: tone, note, label, projected,
  };
}

export function tickerItems(view: LiveView): TickerItem[] {
  const projected = isPreGame(view);
  return view.matchups.map((m) => tickerItem(m, projected));
}

export interface NflItem { key: string; text: string; live: boolean }

/** "kc 9 · lac 0 · q1 7:21", "dal at gb · sun 7:20 pm". */
export function nflItems(games: readonly NflGame[]): NflItem[] {
  return games.map((g) => {
    const status = g.state === 'pre' ? (g.kickoff !== null ? formatKickoff(g.kickoff) : 'upcoming') : gameStatusText(g);
    const text = g.state === 'pre' || g.homeScore === null || g.awayScore === null
      ? `${g.away} at ${g.home} · ${status}`
      : `${g.away} ${g.awayScore} · ${g.home} ${g.homeScore} · ${status}`;
    return { key: g.id, text: text.toLowerCase(), live: g.state === 'live' };
  });
}
