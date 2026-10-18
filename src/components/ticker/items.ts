/* What the score ticker shows, as plain data: one item per matchup (mine first) and one per NFL game. */
import { formatOdds } from '../../app/format';
import type { LiveView, MatchupLive, NflGame } from '../../engine/live';
import { gameStatusText, isPreGame } from '../../engine/live';
import { fullName } from '../../engine/nfl';
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
  /** the left team's win chance, 0 to 1 (the pinned pill draws it as a thin bar) */
  winLeft: number;
}

const score = (n: number) => n.toFixed(1);

/** `meFirst` puts my team on the left (the pinned pill reads "me – them"); other matchups keep the engine's order. */
export function tickerItem(m: MatchupLive, projected: boolean, meFirst = false): TickerItem {
  const swap = meFirst && m.b.isMe;
  const l = swap ? m.b : m.a, r = swap ? m.a : m.b;
  const ls = projected ? l.projection : l.actual, rs = projected ? r.projection : r.actual;
  const decided = m.final && !projected;
  const lead = Math.abs(ls - rs) < 0.005 ? null : ls > rs ? 'left' : 'right';
  const p = swap ? 1 - m.winA : m.winA;
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
    leftScore: score(ls), rightScore: score(rs), lead, pct, fav, pctTone: tone, note, label, projected, winLeft: p,
  };
}

/** The matchups for the "your league" segment: every matchup except mine, which is pinned at the left of the bar. */
export function tickerItems(view: LiveView): TickerItem[] {
  const projected = isPreGame(view);
  return view.matchups.filter((m) => !(m.a.isMe || m.b.isMe)).map((m) => tickerItem(m, projected));
}

/** My own matchup, me on the left, for the pinned pill. Null when I have none this week. */
export function pinnedItem(view: LiveView): TickerItem | null {
  return view.mine ? tickerItem(view.mine, isPreGame(view), true) : null;
}

export interface NflItem {
  key: string;
  /** the game id: the item links to /nfl?game=<id> */
  id: string;
  /** the score part: "lac 3 · kc 19", or "dal at gb" before kickoff */
  score: string;
  /** the status part, in its own accent: "q2 0:05", "halftime", "final", "sun 7:20 pm" */
  status: string;
  state: NflGame['state'];
  /** I have starters in this game */
  mine: boolean;
  /** what the layout says with colour and position, for the screen reader */
  label: string;
  /** the text on screen, as one line (tests and the collapsed measure use it) */
  text: string;
  live: boolean;
}

const STATE_ORDER: Record<NflGame['state'], number> = { live: 0, final: 1, pre: 2 };

/** One item per NFL game: live games first, then finals (the latest kickoff first), then the kickoffs still to come (the soonest first).
    `mine` maps an NFL team code to how many of my starters play for it. */
export function nflItems(games: readonly NflGame[], mine: ReadonlyMap<string, number> = new Map()): NflItem[] {
  const sorted = [...games].sort((a, b) => {
    const ka = a.kickoff ?? 0, kb = b.kickoff ?? 0;
    return STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.state === 'final' ? kb - ka : ka - kb) || a.id.localeCompare(b.id);
  });
  return sorted.map((g) => {
    const status = g.state === 'pre' ? (g.kickoff !== null ? formatKickoff(g.kickoff) : 'upcoming') : gameStatusText(g);
    const scored = g.state !== 'pre' && g.homeScore !== null && g.awayScore !== null;
    const score = scored ? `${g.away} ${g.awayScore} · ${g.home} ${g.homeScore}` : `${g.away} at ${g.home}`;
    const n = (mine.get(g.home) ?? 0) + (mine.get(g.away) ?? 0);
    let say: string;
    if (!scored) say = `${fullName(g.away)} at ${fullName(g.home)}`;
    else if (g.homeScore === g.awayScore) say = `tied`;
    else {
      const homeAhead = g.homeScore! > g.awayScore!;
      say = `${fullName(homeAhead ? g.home : g.away)} ${g.state === 'final' ? 'won' : 'lead'}`;
    }
    const label = [g.state === 'live' ? 'live' : null, say, n > 0 ? (n === 1 ? 'you have 1 starter' : `you have ${n} starters`) : null].filter(Boolean).join(', ');
    return {
      key: g.id, id: g.id, score: score.toLowerCase(), status: status.toLowerCase(), state: g.state, mine: n > 0, label,
      text: `${score} · ${status}`.toLowerCase(), live: g.state === 'live',
    };
  });
}
