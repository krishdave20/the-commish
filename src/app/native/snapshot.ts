/* What the iPhone app's native screens draw (ios/App/Model/Snapshot.swift decodes this exact shape). Pure builders: the engine's own numbers,
   flattened to plain JSON, so a SwiftUI list never re-derives a figure the web app shows differently. The feed (NativeFeed.tsx) posts a new
   snapshot whenever one of its inputs changes. Bump SNAPSHOT_VERSION on a breaking change; the app shows "update the app" for a newer one. */
import { teamColors } from '../../engine/nfl/teamColors';
import { SLOT_LABEL } from '../../engine';
import type { Engine, Model, Scenario, SimSummary } from '../../engine';
import type { LiveView, MatchupLive, StarterLive, TeamLive } from '../../engine/live';
import type { Hero, Moment } from '../../engine/moments';
import { teamResult } from '../results';
import type { NativeActivity } from './activityPayload';

export const SNAPSHOT_VERSION = 1;

/** A player the app draws with a headshot on his team's colours (Sleeper's CDN by `pid`, a monogram when it fails). */
export interface NativePlayer { pid: string; name: string; pos: string; team: string | null; colors: [string, string] | null }

export interface NativeStarter extends NativePlayer {
  slot: string;
  points: number;
  projected: number;
  state: 'pre' | 'live' | 'final' | 'idle';
  /** "cin vs pit · q3 8:12" */
  game: string;
}

export interface NativeTeamLive { rid: number; name: string; manager: string; score: number; projected: number; starters: NativeStarter[] }

export interface NativeLiveMatchup { id: number; a: NativeTeamLive; b: NativeTeamLive; winA: number; preWinA: number; final: boolean; tags: string[] }

export interface NativeLineupRow extends NativePlayer {
  slot: string;
  starting: boolean;
  exp: number;
  floor: number;
  ceiling: number;
  /** Sleeper's injury status, lowercase ("questionable"); empty when healthy */
  injury: string;
  played: boolean;
  /** this week's points once his game kicked off */
  points: number | null;
}

export interface NativeLineup { week: number; total: number; best: number; floor: number; ceiling: number; rows: NativeLineupRow[] }

export interface NativeStanding {
  rid: number; team: string; manager: string; wins: number; losses: number; ties: number; pf: number;
  /** chances, 0 to 1 (three decimals) */
  playoff: number; title: number;
  mark: string; clinch: boolean; elim: boolean; isMe: boolean;
  /** place in the standings (wins, then points for) */
  place: number;
}

export interface NativePlanItem { id: string; title: string; detail: string; to: string; action: string; live: boolean; countdownTo: number | null }

export interface NativeSnapshot {
  v: number;
  status: 'signed-out' | 'loading' | 'ready' | 'error';
  /** a sentence for 'error', or the load step for 'loading' ("building the model…") */
  message: string | null;
  account: { userId: string; username: string; displayName: string; avatar: string | null } | null;
  leagues: Array<{ id: string; name: string; active: boolean }>;
  team: { rid: number; name: string; league: string; season: string; week: number; record: string; place: number | null; teams: number } | null;
  hero: Hero | null;
  plan: NativePlanItem[];
  activity: NativeActivity | null;
  /** my matchup, live (null before the live layer has a view) */
  matchup: NativeLiveMatchup | null;
  /** the rest of the league's matchups this week */
  scoreboard: NativeLiveMatchup[];
  standings: NativeStanding[];
  lineup: NativeLineup | null;
  /** games are on: the app shows its live tab's red dot and keeps the feed polling */
  live: boolean;
  asOf: number | null;
  previewing: boolean;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function nativePlayer(pid: string, name: string, pos: string, team: string | null): NativePlayer {
  const c = teamColors(team);
  return { pid, name, pos, team, colors: c ? [c.primary, c.secondary] : null };
}

function starter(p: StarterLive): NativeStarter {
  return { ...nativePlayer(p.pid, p.name, p.pos, p.nfl), slot: SLOT_LABEL[p.slot] ?? p.slot, points: r1(p.actual), projected: r1(p.projection), state: p.state, game: p.gameText };
}

function teamLive(t: TeamLive): NativeTeamLive {
  return { rid: t.rid, name: t.name, manager: t.manager, score: r1(t.actual), projected: r1(t.projection), starters: t.starters.map(starter) };
}

/** A matchup with my team as `a` when it is mine. */
export function liveMatchup(m: MatchupLive): NativeLiveMatchup {
  const flip = m.b.isMe && !m.a.isMe;
  const [a, b] = flip ? [m.b, m.a] : [m.a, m.b];
  return { id: m.id, a: teamLive(a), b: teamLive(b), winA: flip ? 1 - m.winA : m.winA, preWinA: flip ? 1 - m.preWinA : m.preWinA, final: m.final, tags: [...m.tags] };
}

export function scoreboard(view: LiveView | null): { mine: NativeLiveMatchup | null; rest: NativeLiveMatchup[] } {
  if (!view) return { mine: null, rest: [] };
  return { mine: view.mine ? liveMatchup(view.mine) : null, rest: view.matchups.filter((m) => m !== view.mine).map(liveMatchup) };
}

/** Every team in standings order (wins, ties, then points for) with its place, the simulated odds (the what-if run when there is one, as the
    playoff picture shows them) and the clinch marks. */
export function standings(engine: Engine, model: Model, sim: SimSummary | null): NativeStanding[] {
  const des = engine.designations();
  const order = [...model.teams].sort((a, b) => b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pf - a.pf);
  return order.map((t, i) => {
    const r = teamResult(model, sim, t.rid);
    const d = des[t.rid];
    return {
      rid: t.rid, team: t.team, manager: t.manager, wins: t.wins, losses: t.losses, ties: t.ties, pf: r1(t.pf),
      playoff: r3(r.playoff), title: r3(r.title), mark: d?.mark ?? '', clinch: !!d?.clinch, elim: !!d?.elim, isMe: t.rid === engine.meRid, place: i + 1,
    };
  });
}

/** This week's lineup as the engine sets it (pins and benches from the what-if included), the bench after the starters. */
export function lineup(engine: Engine, scenario: Scenario): NativeLineup {
  const week = engine.model.meta.currentWeek;
  const scope = engine.scope(scenario);
  const ros = scope.myRoster();
  const L = scope.lineup(ros, week, true);
  const best = scope.lineup(ros, week, true, { pins: new Set(), benches: new Set() });
  const rows: NativeLineupRow[] = [];
  let floor = 0, ceiling = 0;
  const add = (slot: string, p: (typeof L.bench)[number] | null, starting: boolean, locked: boolean) => {
    if (!p) return;
    const [lo, hi] = scope.range(p, week, true);
    if (starting) { floor += lo; ceiling += hi; }
    const played = locked || p.playedThisWeek;
    rows.push({
      ...nativePlayer(p.pid, p.name, p.pos, p.nfl), slot: SLOT_LABEL[slot] ?? slot, starting, exp: r1(scope.val(p, week, true)), floor: r1(lo), ceiling: r1(hi),
      injury: (p.injury ?? '').toLowerCase(), played, points: played ? r1(p.pts[week] ?? 0) : null,
    });
  };
  for (const s of L.slots) add(s.slot, s.p, true, s.locked);
  for (const p of L.bench) add('BN', p, false, false);
  return { week, total: r1(L.total), best: r1(best.total), floor: r1(floor), ceiling: r1(ceiling), rows };
}

export function planItems(list: readonly Moment[], max = 6): NativePlanItem[] {
  return list.slice(0, max).map((m) => ({
    id: m.id, title: m.title, detail: m.detail, to: m.action.to, action: m.action.label, live: !!m.live, countdownTo: m.countdownTo ?? null,
  }));
}

/** "5–2" or "5–2–1" */
export const recordText = (w: number, l: number, t: number): string => (t ? `${w}–${l}–${t}` : `${w}–${l}`);
