/* The league's storylines for a week: rule-based sentences, every number read off the week's data (no LLM, ever).

   - highest score:  the best team total of the week so far
   - closest finish: the smallest margin among matchups that are over
   - comeback:       the biggest swing in win chance for a team that is now ahead: from its lowest point (before kickoff, or any poll this
                     visit saw) to now; a team must have been an underdog (35% or less) and the swing at least 30 points
   - player of the week: the top fantasy score of any starter
   - heartbreaker:   a lost matchup (over) where the loser's best lineup would have beaten the winner: points left on the bench exceed the margin
   - bench blunder:  the most points left on the sideline by any team
   - standings:      who crosses the playoff line (or changes place) if the results hold, from `standingsMoves` */
import type { BenchRow, LiveView, MatchupLive } from './derive.ts';
import { winSeries } from './derive.ts';
import { moved } from './standings.ts';
import type { StandingsMove } from './standings.ts';
import type { LiveCtx, LiveSnapshot } from './types.ts';

export type StoryKind = 'high score' | 'closest' | 'comeback' | 'player' | 'heartbreaker' | 'blunder' | 'standings';

export interface Storyline {
  kind: StoryKind;
  /** the small label: "highest score" */
  label: string;
  /** the number or short phrase that leads: "142.3", "0.4", "18% → 94%" */
  headline: string;
  /** one sentence */
  text: string;
  /** the matchup it is about, to open it */
  matchupId?: number;
  tone: 'plain' | 'good' | 'warn';
  /** the player a story is about (player of the week, bench blunder), for his headshot */
  player?: { pid: string; name: string; pos: string; nfl: string | null };
}

export const COMEBACK_MAX_START = 0.35;
export const COMEBACK_MIN_SWING = 0.3;

export interface StoryInput {
  view: LiveView;
  ctx: LiveCtx;
  /** the snapshots this visit has seen (live weeks), for swings between polls */
  frames?: readonly LiveSnapshot[];
  moves?: readonly StandingsMove[] | null;
  /** the week is over: sentences say "of the week" rather than "so far" */
  past: boolean;
  playoffTeams: number;
}

const formatPoints1 = (n: number) => n.toFixed(1);
const pct = (p: number) => `${Math.round(p * 100)}%`;
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

function highScore(i: StoryInput): Storyline | null {
  let best: { name: string; pts: number; id: number } | null = null;
  for (const m of i.view.matchups) for (const t of [m.a, m.b]) if (t.actual > 0 && (!best || t.actual > best.pts)) best = { name: t.name, pts: t.actual, id: m.id };
  if (!best) return null;
  return { kind: 'high score', label: 'highest score', headline: formatPoints1(best.pts), text: `${best.name} has the highest score of the week${i.past ? '' : ' so far'}.`, matchupId: best.id, tone: 'good' };
}

const over = (m: MatchupLive) => m.final && m.started;

function closest(i: StoryInput): Storyline | null {
  const done = i.view.matchups.filter(over).sort((p, q) => Math.abs(p.margin) - Math.abs(q.margin));
  const m = done[0];
  if (!m) return null;
  const gap = Math.abs(m.margin);
  const text = gap === 0 ? `${m.a.name} and ${m.b.name} tied.` : `${m.margin > 0 ? m.a.name : m.b.name} beat ${m.margin > 0 ? m.b.name : m.a.name} by ${formatPoints1(gap)}.`;
  return { kind: 'closest', label: 'closest finish', headline: formatPoints1(gap), text, matchupId: m.id, tone: 'warn' };
}

/** Each team's lowest win chance this week (before kickoff, or in any frame) and its chance now. */
function swings(i: StoryInput): Array<{ team: string; low: number; now: number; id: number; fromPre: boolean }> {
  const out: Array<{ team: string; low: number; now: number; id: number; fromPre: boolean }> = [];
  for (const m of i.view.matchups) {
    if (!m.started) continue;
    const series = i.frames && i.frames.length > 1 ? winSeries(i.ctx, i.frames, m.a.rid, 600).map((d) => d.p) : [];
    const lowA = Math.min(m.preWinA, ...series), lowB = Math.min(1 - m.preWinA, ...series.map((p) => 1 - p));
    out.push({ team: m.a.name, low: lowA, now: m.winA, id: m.id, fromPre: lowA === m.preWinA });
    out.push({ team: m.b.name, low: lowB, now: 1 - m.winA, id: m.id, fromPre: lowB === 1 - m.preWinA });
  }
  return out;
}

function comeback(i: StoryInput): Storyline | null {
  const hits = swings(i).filter((s) => s.now > 0.5 && s.low <= COMEBACK_MAX_START && s.now - s.low >= COMEBACK_MIN_SWING).sort((p, q) => (q.now - q.low) - (p.now - p.low));
  const s = hits[0];
  if (!s) return null;
  const text = s.fromPre
    ? `${s.team} had ${pct(s.low)} to win before kickoff and ${i.past ? 'won' : `is at ${pct(s.now)} now`}.`
    : `${s.team} was down to ${pct(s.low)} to win and ${i.past ? 'came back to win' : `is back up to ${pct(s.now)}`}.`;
  return { kind: 'comeback', label: 'biggest comeback', headline: `${pct(s.low)} → ${pct(s.now)}`, text, matchupId: s.id, tone: 'good' };
}

function player(i: StoryInput): Storyline | null {
  const b = i.view.gameBalls[0];
  if (!b) return null;
  const m = i.view.matchups.find((x) => x.a.rid === b.rid || x.b.rid === b.rid);
  return { kind: 'player', label: `player of the week${i.past ? '' : ' so far'}`, headline: formatPoints1(b.points), text: `${b.name.toLowerCase()} (${b.pos.toLowerCase()}) scored the most for ${b.team}.`, matchupId: m?.id, tone: 'good', player: { pid: b.pid, name: b.name, pos: b.pos, nfl: b.nfl } };
}

function heartbreaker(i: StoryInput): Storyline | null {
  const bench = new Map<number, BenchRow>(i.view.bench.map((r) => [r.rid, r]));
  const hits: Array<{ m: MatchupLive; loser: string; winner: string; gap: number; row: BenchRow }> = [];
  for (const m of i.view.matchups) {
    if (!over(m) || m.margin === 0) continue;
    const loser = m.margin > 0 ? m.b : m.a, winner = m.margin > 0 ? m.a : m.b;
    const row = bench.get(loser.rid);
    const gap = Math.abs(m.margin);
    if (row && row.left > gap) hits.push({ m, loser: loser.name, winner: winner.name, gap, row });
  }
  hits.sort((p, q) => p.gap - q.gap);
  const h = hits[0];
  if (!h) return null;
  const who = h.row.top ? ` (${h.row.top.name.toLowerCase()} sat for ${formatPoints1(h.row.top.points)})` : '';
  return { kind: 'heartbreaker', label: 'heartbreaker', headline: formatPoints1(h.gap), text: `${h.loser} lost to ${h.winner} by ${formatPoints1(h.gap)} and left ${formatPoints1(h.row.left)} on the bench${who}.`, matchupId: h.m.id, tone: 'warn' };
}

function blunder(i: StoryInput): Storyline | null {
  const r = i.view.bench.find((x) => x.left > 0 && x.top);
  if (!r || !r.top) return null;
  const m = i.view.matchups.find((x) => x.a.rid === r.rid || x.b.rid === r.rid);
  return { kind: 'blunder', label: 'bench blunder', headline: formatPoints1(r.left), text: `${r.team} left ${formatPoints1(r.left)} on the bench: ${r.top.name.toLowerCase()} sat for ${formatPoints1(r.top.points)}.`, matchupId: m?.id, tone: 'warn', ...(r.top.pid ? { player: { pid: r.top.pid, name: r.top.name, pos: r.top.pos ?? '', nfl: r.top.nfl ?? null } } : {}) };
}

/** "x moves into playoff position, y falls out" or, with no line crossed, who changes places. */
export function standingsLine(moves: readonly StandingsMove[], playoffTeams: number, past: boolean): { headline: string; text: string } | null {
  const mv = moved(moves);
  if (!mv.length) return null;
  const ins = mv.filter((m) => m.line === 'in'), outs = mv.filter((m) => m.line === 'out');
  const names = (xs: readonly StandingsMove[]) => xs.map((m) => m.name).join(' and ');
  const parts: string[] = [];
  if (ins.length) parts.push(`${names(ins)} ${ins.length > 1 ? 'move' : 'moves'} into playoff position (top ${playoffTeams})`);
  if (outs.length) parts.push(`${names(outs)} ${outs.length > 1 ? 'fall' : 'falls'} out`);
  if (!parts.length) {
    const up = [...mv].sort((p, q) => q.delta - p.delta)[0]!;
    parts.push(up.delta > 0 ? `${up.name} climbs from ${ord(up.before.rank)} to ${ord(up.after.rank)}` : `${mv.length} ${mv.length === 1 ? 'team changes' : 'teams change'} places`);
  }
  const lead = past ? '' : 'if the results hold, ';
  const text = `${lead}${parts.join('; ')}.`;
  return { headline: `${mv.length} ${mv.length === 1 ? 'team moves' : 'teams move'}`, text };
}

export function storylines(i: StoryInput): Storyline[] {
  const out: Array<Storyline | null> = [highScore(i), closest(i), comeback(i), player(i), heartbreaker(i), blunder(i)];
  const line = i.moves ? standingsLine(i.moves, i.playoffTeams, i.past) : null;
  if (line) out.push({ kind: 'standings', label: i.past ? 'who moved' : 'standings if it holds', headline: line.headline, text: line.text, tone: 'plain' });
  return out.filter((x): x is Storyline => !!x);
}
