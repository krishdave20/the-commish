/* The live activity's content, as plain data. Pure: every function reads its arguments and nothing else.

   A moment (see types.ts) says WHAT is going on; an activity adds the detail the pill shows around it, from the data the app already holds:
   the live matchup and its feed (game day's poller), the moments context (the lineup, the schedule, the waiver board, the draft) and the draft room's
   live snapshot. Each activity has a compact line (the pill), an expanded card (a leading region, a centre, a bottom) and, with several running,
   a minimal circle. Anything the data lacks leaves its piece out: with nothing but the moment the activity falls back to the moment's own words. */
import { fieldRole, spotText } from '../live/situation.ts';
import { gameStatusText } from '../live/scores.ts';
import type { LiveView, MatchupLive, StarterLive, TeamLive } from '../live/derive.ts';
import type { RawChange } from '../live/feed.ts';
import { pts1 } from './scope.ts';
import { clockWords } from './time.ts';
import type { Moment, MomentCtx, StarterInfo, WaiverTop } from './types.ts';

export { ordinal, pts1 } from './scope.ts';

/* ---------- kinds ---------- */

export type ActivityKind = 'matchup' | 'kickoff' | 'waivers' | 'draft' | 'recap' | 'generic';

/** Which activity a moment belongs to. One activity per kind runs at a time (the highest-priority moment of the kind leads). */
export function activityKind(m: Moment): ActivityKind {
  switch (m.kind) {
    case 'live-matchup': case 'monday-night': return 'matchup';
    case 'game-day': case 'final-check': return 'kickoff';
    case 'waivers-tonight': return 'waivers';
    case 'draft-clock': case 'draft-countdown': return 'draft';
    case 'final-whistle': case 'week-recap': return 'recap';
    default: return 'generic';
  }
}

/* ---------- the data each activity carries ---------- */

export interface PlayerRef { pid: string; name: string; pos: string; /** a team defense's code */ team?: string }

export interface SideData { name: string; score: number; projected: number; /** the two best starters */ stack: PlayerRef[] }

export interface NowPlaying {
  pid: string;
  name: string;
  pos: string;
  points: number;
  /** "chase · on offense · 2nd & 7 at pit 34 · q3 8:12" */
  line: string;
  /** the same without the clock ("chase · on offense · 2nd & 7 at pit 34"), so a narrow row can cut the middle and keep the clock */
  lead: string;
  /** "q3 8:12", "halftime" */
  clock: string;
  /** his unit is on the field (null: the feed has no possession) */
  onField: boolean | null;
}

export interface MatchupData {
  week: number;
  me: SideData;
  opp: SideData;
  /** my chance to win from here, 0 to 1 */
  winP: number;
  /** the share of starter-minutes played, both sides, 0 to 1 */
  progress: number;
  final: boolean;
  /** up to three of my starters whose game is on, those on the field first */
  nowPlaying: NowPlaying[];
  /** my newest scoring change: "+6.4 · ja'marr chase" */
  lastPlay: { name: string; delta: number; at: number } | null;
  counts: { yet: number; live: number; done: number };
}

export interface KickoffData {
  /** the first kickoff still to come (epoch ms) */
  at: number;
  /** "nyj at buf" */
  game: string | null;
  /** my starters whose team plays in that first window */
  playing: PlayerRef[];
  startersTotal: number;
  /** starters with an injury designation or on a bye */
  flags: Array<{ pid: string; name: string; status: string }>;
}

export interface WaiversData {
  /** when the claims process (epoch ms) */
  runAt: number;
  /** the best two adds; empty before the board is worked out */
  adds: WaiverTop[];
  /** the league bids with FAAB */
  faab: boolean;
  faabLeft: number | null;
  /** the board has been computed */
  known: boolean;
}

export interface DraftLiveInfo {
  /** picks made by others before my next one; 0 = on the clock; null when unknown or none left */
  picksUntil: number | null;
  /** my next pick's number */
  nextPick: number | null;
  /** the best players left by value over replacement */
  best: Array<{ pid: string; name: string; pos: string; team: string | null; tier: number; vor: number }>;
  /** the starting slots my picks have not filled: "rb", "te", "flex" */
  needs: string[];
  /** the pick made last */
  last: { pickNo: number; name: string; pos: string; by: string } | null;
}

export interface DraftData {
  mode: 'clock' | 'countdown';
  picksUntil: number | null;
  paused: boolean;
  startsAt: number | null;
  mySlot: number | null;
  teams: number | null;
  info: DraftLiveInfo | null;
}

export interface RecapData {
  week: number | null;
  verdict: 'W' | 'L' | 'T';
  mine: number;
  theirs: number;
  oppName: string;
  top: { name: string; pts: number } | null;
  /** my playoff odds before and after the week, when both are known */
  odds: { from: number; to: number } | null;
}

interface Base { id: string; moment: Moment }
export type Activity =
  | (Base & { kind: 'matchup'; data: MatchupData | null })
  | (Base & { kind: 'kickoff'; data: KickoffData | null })
  | (Base & { kind: 'waivers'; data: WaiversData })
  | (Base & { kind: 'draft'; data: DraftData })
  | (Base & { kind: 'recap'; data: RecapData | null })
  | (Base & { kind: 'generic'; data: null });

/* ---------- words ---------- */

const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;

/** "ja'marr chase" → "chase"; "kenneth walker iii" → "walker"; a team defense keeps its name ("pit d/st"). */
export function shortName(name: string, pos?: string): string {
  if (pos === 'DEF') return name.toLowerCase();
  const words = name.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && SUFFIX.test(words[words.length - 1]!)) words.pop();
  return (words[words.length - 1] ?? name).toLowerCase();
}

/** "112.3–98.0" */
export const scoreLine = (a: number, b: number): string => `${pts1(a)}–${pts1(b)}`;

/** "chase · on offense · 2nd & 7 at pit 34 · q3 8:12": the name, whether his unit is on the field, the down and the spot while it is, the clock. */
export function playerLine(p: Pick<StarterLive, 'name' | 'pos' | 'nfl' | 'game'>): { line: string; lead: string; clock: string; onField: boolean | null } {
  const g = p.game;
  const sit = g?.situation;
  const role = g ? fieldRole(p.pos, p.nfl, sit?.possession) : null;
  const parts = [shortName(p.name, p.pos)];
  if (role) parts.push(role.label);
  if (role?.onField && sit) {
    const down = [sit.downText.toLowerCase(), spotText(sit)].filter(Boolean).join(' ');
    if (down) parts.push(down);
  }
  const clock = g ? gameStatusText(g) : '';
  const lead = parts.join(' · ');
  return { line: clock ? `${lead} · ${clock}` : lead, lead, clock, onField: role ? role.onField : null };
}

/* ---------- builders ---------- */

const refOf = (p: Pick<StarterLive, 'pid' | 'name' | 'pos' | 'nfl'>): PlayerRef => ({ pid: p.pid, name: p.name, pos: p.pos, ...(p.pos === 'DEF' && p.nfl ? { team: p.nfl } : {}) });

function sideOf(t: TeamLive): SideData {
  const best = t.starters.slice().sort((a, b) => b.projection - a.projection || a.name.localeCompare(b.name)).slice(0, 2);
  return { name: t.name, score: t.actual, projected: t.projection, stack: best.map(refOf) };
}

/** My matchup from the live view and the scoring feed (newest change first). Null when there is no matchup of mine. */
export function matchupData(view: LiveView | null | undefined, changes: readonly RawChange[] = []): MatchupData | null {
  const m: MatchupLive | null | undefined = view?.mine;
  if (!view || !m) return null;
  const meFirst = m.a.isMe || !m.b.isMe;
  const me = meFirst ? m.a : m.b, opp = meFirst ? m.b : m.a;
  const live = me.starters.filter((p) => p.state === 'live').map((p) => {
    const w = playerLine(p);
    return { pid: p.pid, name: p.name, pos: p.pos, points: p.actual, line: w.line, lead: w.lead, clock: w.clock, onField: w.onField };
  });
  // those on the field first, then the biggest scorers
  live.sort((a, b) => Number(b.onField === true) - Number(a.onField === true) || b.points - a.points || a.name.localeCompare(b.name));
  const mineChange = changes.find((c) => c.rid === me.rid && c.delta > 0);
  const who = mineChange ? me.starters.find((p) => p.pid === mineChange.pid) : undefined;
  return {
    week: view.week,
    me: sideOf(me), opp: sideOf(opp),
    winP: meFirst ? m.winA : 1 - m.winA,
    progress: Math.max(0, Math.min(1, 1 - (me.remaining + opp.remaining) / 2)),
    final: m.final,
    nowPlaying: live.slice(0, 3),
    lastPlay: mineChange ? { name: who?.name ?? 'a starter', delta: mineChange.delta, at: mineChange.at } : null,
    counts: { yet: me.yet, live: me.live, done: me.done },
  };
}

/** A score jump worth a flash: my team gained this many points between two polls. */
export const BIG_MOMENT = 6;

export interface BigMoment { at: number; delta: number; /** the starter who scored most of it */ pid: string; /** how many starters moved */ players: number }

/** The poll after `since` (a poll's `at`) in which my team's score jumped by `min` points or more, newest first. Rule-based on the delta alone:
    nothing here says what kind of play it was. */
export function bigMoments(changes: readonly RawChange[], rid: number, since: number, min = BIG_MOMENT): BigMoment[] {
  const byPoll = new Map<number, RawChange[]>();
  for (const c of changes) {
    if (c.rid !== rid || c.at <= since) continue;
    const list = byPoll.get(c.at);
    if (list) list.push(c); else byPoll.set(c.at, [c]);
  }
  const out: BigMoment[] = [];
  for (const [at, list] of byPoll) {
    const delta = Math.round(list.reduce((s, c) => s + c.delta, 0) * 100) / 100;
    if (delta < min) continue;
    const top = list.slice().sort((a, b) => b.delta - a.delta)[0]!;
    out.push({ at, delta, pid: top.pid, players: list.filter((c) => c.delta > 0).length });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** "+6.4 · chase" (and "+12.8 · chase +1" when more than one starter moved). */
export function bigMomentText(b: BigMoment, name: string): string {
  return `+${pts1(b.delta)} · ${shortName(name)}${b.players > 1 ? ` +${b.players - 1}` : ''}`;
}

/** The starters flagged on the injury report or on a bye. */
const FLAGGED = /questionable|doubtful|out|suspended|ir|pup|nfi/i;
/** Games kicking off within this long of the first one are "the same window". */
export const WINDOW = 90 * 60_000;

export function kickoffData(ctx: MomentCtx | null, m: Moment): KickoffData | null {
  if (!ctx) return null;
  const games = ctx.schedule.games.filter((g) => Number.isFinite(g.kickoff));
  const pre = games.filter((g) => g.state === 'pre').sort((a, b) => a.kickoff - b.kickoff);
  const first = pre[0] ?? null;
  const at = first?.kickoff ?? (m.countdownTo !== undefined ? m.countdownTo + (m.label === 'inactives' ? 90 * 60_000 : 0) : null);
  if (at === null) return null;
  const starters: StarterInfo[] = ctx.model?.starters ?? [];
  const teams = new Set<string>();
  if (first) for (const g of pre) if (g.kickoff - first.kickoff <= WINDOW) { teams.add(g.home); teams.add(g.away); }
  const everyone = new Set<string>();
  for (const g of games) { everyone.add(g.home); everyone.add(g.away); }
  const playing = starters.filter((p) => p.nfl !== null && teams.has(p.nfl)).map((p): PlayerRef => ({ pid: p.pid, name: p.name, pos: p.pos, ...(p.pos === 'DEF' && p.nfl ? { team: p.nfl } : {}) }));
  const flags: KickoffData['flags'] = [];
  for (const p of starters) {
    if (p.played) continue;
    const bye = everyone.size > 0 && p.nfl !== null && !everyone.has(p.nfl);
    if (bye) flags.push({ pid: p.pid, name: p.name, status: 'on bye' });
    else if (p.injury && FLAGGED.test(p.injury)) flags.push({ pid: p.pid, name: p.name, status: p.injury.toLowerCase() });
  }
  return { at, game: first ? `${first.away} at ${first.home}`.toLowerCase() : null, playing, startersTotal: starters.length, flags };
}

export function waiversData(ctx: MomentCtx | null, m: Moment): WaiversData {
  const w = ctx?.model?.waiver ?? null;
  const adds = w ? (w.adds ?? (w.top ? [w.top] : [])).slice(0, 2) : [];
  return { runAt: m.countdownTo ?? 0, adds, faab: !!w?.faab, faabLeft: w?.faab ? ctx?.model?.faabLeft ?? null : null, known: w !== null };
}

export function draftData(ctx: MomentCtx | null, m: Moment, info: DraftLiveInfo | null): DraftData {
  const d = ctx?.draft ?? null;
  if (m.kind === 'draft-countdown') return { mode: 'countdown', picksUntil: null, paused: false, startsAt: m.countdownTo ?? d?.startTime ?? null, mySlot: d?.mySlot ?? null, teams: d?.teams ?? null, info: null };
  // without the context, the moment's own title carries the count ("you’re on the clock in 4 picks")
  const parsed = /on the clock in (\d+) picks?/.exec(m.title);
  const fromTitle = m.title === 'you’re on the clock' ? 0 : parsed ? Number(parsed[1]) : null;
  const picksUntil = d ? d.picksUntilMine : fromTitle;
  return { mode: 'clock', picksUntil, paused: d?.status === 'paused' || /paused/.test(m.title), startsAt: null, mySlot: d?.mySlot ?? null, teams: d?.teams ?? null, info: info ?? null };
}

export function recapData(ctx: MomentCtx | null, view: LiveView | null | undefined): RecapData | null {
  const live = ctx?.live;
  const last = ctx?.model?.lastResult;
  let mine: number, theirs: number, oppName: string, week: number | null, top: RecapData['top'];
  if (live && live.final) {
    mine = live.mine.pts; theirs = live.theirs.pts; oppName = live.theirs.name; week = live.week ?? ctx?.model?.week ?? null; top = live.mine.top ?? null;
  } else if (last) {
    mine = last.mine; theirs = last.theirs; oppName = last.oppName; week = last.week; top = null;
  } else {
    return null;
  }
  // the live view knows every starter's points, even where the context was built without them
  const vm = view?.mine;
  if (!top && vm) {
    const me = vm.a.isMe || !vm.b.isMe ? vm.a : vm.b;
    const best = me.starters.slice().sort((a, b) => b.actual - a.actual)[0];
    if (best && best.actual > 0) top = { name: best.name, pts: best.actual };
  }
  const prev = ctx?.previous && week !== null && ctx.previous.week === week ? ctx.previous.playoffPct : null;
  const now = ctx?.model?.playoffPct ?? null;
  const odds = prev !== null && now !== null ? { from: prev, to: now } : null;
  const tie = Math.abs(mine - theirs) < 0.005;
  return { week, verdict: tie ? 'T' : mine > theirs ? 'W' : 'L', mine, theirs, oppName, top, odds };
}

export interface ActivityInputs {
  ctx: MomentCtx | null;
  /** game day's live view (my matchup is `view.mine`) */
  view: LiveView | null;
  /** the scoring feed, newest first */
  changes: readonly RawChange[];
  /** the draft room's live snapshot, flattened */
  draft: DraftLiveInfo | null;
}

export const NO_INPUTS: ActivityInputs = { ctx: null, view: null, changes: [], draft: null };

/** The activities for the moments the live activity may show (best first): one per kind, the highest-priority moment of each kind leading.
    A moment of no known kind is its own generic activity. */
export function buildActivities(list: readonly Moment[], inputs: ActivityInputs = NO_INPUTS): Activity[] {
  const out: Activity[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    const kind = activityKind(m);
    const id = kind === 'generic' ? `generic:${m.id}` : kind;
    if (seen.has(id)) continue;
    seen.add(id);
    switch (kind) {
      case 'matchup': out.push({ id, kind, moment: m, data: matchupData(inputs.view, inputs.changes) }); break;
      case 'kickoff': out.push({ id, kind, moment: m, data: kickoffData(inputs.ctx, m) }); break;
      case 'waivers': out.push({ id, kind, moment: m, data: waiversData(inputs.ctx, m) }); break;
      case 'draft': out.push({ id, kind, moment: m, data: draftData(inputs.ctx, m, inputs.draft) }); break;
      case 'recap': out.push({ id, kind, moment: m, data: recapData(inputs.ctx, inputs.view) }); break;
      default: out.push({ id, kind: 'generic', moment: m, data: null });
    }
  }
  return out;
}

/* ---------- the compact line, urgency and state ---------- */

/** The time left on a countdown moment, in ms (null when it has none). */
export const timeLeft = (m: Moment, now: number): number | null => (m.countdownTo === undefined ? null : m.countdownTo - now);

/** 'urgent' under five minutes, 'soon' under half an hour, else 'calm'. */
export function urgency(m: Moment, now: number): 'urgent' | 'soon' | 'calm' {
  const left = timeLeft(m, now);
  if (left === null) return 'calm';
  return left <= 5 * 60_000 ? 'urgent' : left <= 30 * 60_000 ? 'soon' : 'calm';
}

/** "kickoff 1:42:10", "waivers 3h 12m": a countdown's label and the time left, or "kickoff now". */
export function countdownText(m: Moment, now: number, fallback: string): string {
  const left = timeLeft(m, now);
  const label = m.label ?? fallback;
  if (left === null) return label;
  return left <= 0 ? `${label} now` : `${label} ${clockWords(left, !!m.precise)}`;
}

/** The pill's one line, which is also the accessible name of the pill and of its minimal circle. */
export function compactText(a: Activity, now: number): string {
  const m = a.moment;
  switch (a.kind) {
    case 'matchup': {
      const d = a.data;
      if (!d) return m.pill?.text ?? m.title;
      return `${d.me.name} ${pts1(d.me.score)} · ${pts1(d.opp.score)} · ${Math.round(d.winP * 100)}%`;
    }
    case 'kickoff': return countdownText(m, now, 'kickoff');
    case 'waivers': return countdownText(m, now, 'waivers');
    case 'draft': {
      const d = a.data;
      if (d.mode === 'countdown') return countdownText(m, now, 'draft');
      if (d.paused) return 'draft paused';
      if (d.picksUntil === 0) return 'on the clock';
      if (d.picksUntil !== null) return `pick in ${d.picksUntil}`;
      return 'draft live';
    }
    case 'recap': {
      const d = a.data;
      return d ? `${d.verdict} ${scoreLine(d.mine, d.theirs)}` : m.pill?.text ?? m.title;
    }
    default: {
      if (m.pill) return m.pill.text;
      const left = timeLeft(m, now);
      if (left === null) return m.title;
      const when = left <= 0 ? 'now' : `in ${clockWords(left, !!m.precise)}`;
      return m.label ? `${m.label} ${when}` : `${m.title} ${when}`;
    }
  }
}

/** What counts as "the next state" of an activity: hiding it holds until this changes (the lead changing hands, the clock reaching you,
    a countdown turning urgent, the final whistle). */
export function stateKey(a: Activity, now: number): string {
  const stage = () => {
    const left = timeLeft(a.moment, now);
    return left === null ? '' : left <= 0 ? 'now' : left <= 5 * 60_000 ? 'urgent' : 'calm';
  };
  switch (a.kind) {
    case 'matchup': {
      const p = a.data ? a.data.winP : a.moment.pill?.bar;
      return `${a.data?.final ? 'final' : 'live'}:${p === undefined ? '' : p >= 0.5 ? 'ahead' : 'behind'}`;
    }
    case 'kickoff': case 'waivers': return `${a.moment.label ?? ''}:${stage()}`;
    case 'draft': {
      const d = a.data;
      if (d.mode === 'countdown') return `countdown:${stage()}`;
      return d.paused ? 'paused' : d.picksUntil === 0 ? 'clock' : d.picksUntil !== null && d.picksUntil <= 3 ? 'soon' : 'far';
    }
    case 'recap': return `recap:${a.data?.verdict ?? ''}`;
    default: return `${a.moment.title}:${stage()}`;
  }
}

/** The short name of an activity ("live matchup", "kickoff"): the header of its expanded card. */
export function activityTitle(a: Activity): string {
  switch (a.kind) {
    case 'matchup': return a.moment.kind === 'monday-night' ? 'monday night' : 'live matchup';
    case 'kickoff': return a.moment.label === 'inactives' ? 'lineup check' : 'kickoff';
    case 'waivers': return 'waivers';
    case 'draft': return a.data.mode === 'countdown' ? 'the draft' : 'on the clock';
    case 'recap': return 'final';
    default: return a.moment.label ?? 'now';
  }
}
