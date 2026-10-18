/* "Replay last week": a finished week played back as if it were live, through the same LiveSource interface.

   Time. Real kickoffs run from Thursday night to Monday night. The replay keeps each kickoff's place in the day but squeezes
   any gap longer than a game plus 20 minutes, so a full Sunday takes about two minutes. Sim minutes run at SIM_MIN_PER_SEC per
   real second, times the chosen speed.
   Games. Each lasts GAME_MIN sim minutes; the share played is (t - kickoff) / GAME_MIN, which also gives the quarter and clock.
   Points. A player has nothing before his game kicks off. During it his final points arrive in 3 to 6 equal chunks at fixed
   (hashed) moments, and the last chunk makes the final total exact, so the feed shows plays, not a ramp. */
import { mulberry32 } from '../bracket/prng.ts';
import type { Matchup } from '../../data/types.ts';
import { rowsFromMatchups } from './source.ts';
import type { LiveSource } from './source.ts';
import type { LiveRow, LiveSnapshot, NflGame } from './types.ts';

export const GAME_MIN = 195;
export const SIM_MIN_PER_SEC = 6;
export const REPLAY_SPEEDS = [1, 2, 4, 8] as const;
const MIN = 60_000;
const r2 = (x: number) => Math.round(x * 100) / 100;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export interface Chunk { at: number; pts: number }

/** The moments (share of the game played) at which a player's final points arrive, and how many points each brings. */
export function scoringChunks(pid: string, total: number): Chunk[] {
  if (total === 0) return [];
  const rnd = mulberry32(hash(pid));
  const n = 3 + Math.floor(rnd() * 4);
  const at = Array.from({ length: n }, () => 0.06 + rnd() * 0.88).sort((a, b) => a - b);
  const share = r2(total / n);
  return at.map((u, i) => ({ at: u, pts: i === n - 1 ? r2(total - share * (n - 1)) : share }));
}

/** A player's points once `f` of his game has been played. */
export function pointsAt(chunks: readonly Chunk[], total: number, f: number): number {
  if (f >= 1) return total;
  if (f <= 0) return 0;
  return r2(chunks.filter((c) => c.at <= f).reduce((s, c) => s + c.pts, 0));
}

export interface ReplayOpts {
  week: number;
  /** the finished week's matchups (players_points are the final numbers) */
  matchups: readonly Matchup[];
  /** the week's games with real kickoffs (final scores are ignored) */
  games: readonly NflGame[];
  /** a player's NFL team, to find his game */
  teamOf: (pid: string) => string | null;
  now?: () => number;
}

export interface ReplayStatus {
  playing: boolean;
  speed: number;
  /** 0 to 1 */
  fraction: number;
  /** the real time of day the NFL clock shows (epoch ms) */
  clock: number;
  complete: boolean;
}

export interface ReplaySource extends LiveSource {
  kind: 'replay';
  play(): void;
  pause(): void;
  setSpeed(speed: number): void;
  restart(): void;
  /** jump to a share of the replay (0 to 1) */
  seek(fraction: number): void;
  status(): ReplayStatus;
}

export function replaySource(o: ReplayOpts): ReplaySource {
  const now = o.now ?? Date.now;
  const games = o.games.filter((g) => g.kickoff !== null).slice().sort((a, b) => a.kickoff! - b.kickoff!);
  const gameOf = new Map<string, NflGame>();
  for (const g of games) { gameOf.set(g.home, g); gameOf.set(g.away, g); }

  /* squeezed timeline: sim minute of each kickoff, and back */
  const simStart: number[] = [];
  games.forEach((g, i) => {
    if (i === 0) { simStart.push(10); return; }
    const gap = (g.kickoff! - games[i - 1]!.kickoff!) / MIN;
    simStart.push(simStart[i - 1]! + Math.min(gap, GAME_MIN + 20));
  });
  const total = games.length ? simStart[simStart.length - 1]! + GAME_MIN : 1;
  const simToReal = (t: number): number => {
    if (!games.length) return 0;
    let i = 0;
    while (i + 1 < games.length && simStart[i + 1]! <= t) i++;
    return games[i]!.kickoff! + (t - simStart[i]!) * MIN;
  };

  const finals = rowsFromMatchups(o.matchups);
  const chunkCache = new Map<string, Chunk[]>();
  const chunksOf = (pid: string, pts: number) => {
    let c = chunkCache.get(pid);
    if (!c) { c = scoringChunks(pid, pts); chunkCache.set(pid, c); }
    return c;
  };

  let t = 0, speed = 1, playing = true, last = now();

  const advance = () => {
    const n = now();
    if (playing) t = Math.min(total, t + ((n - last) / 1000) * SIM_MIN_PER_SEC * speed);
    last = n;
  };

  const gameAt = (g: NflGame, i: number): NflGame => {
    const f = Math.max(0, Math.min(1, (t - simStart[i]!) / GAME_MIN));
    if (f <= 0) return { ...g, state: 'pre', quarter: '', clock: '', elapsed: 0, homeScore: null, awayScore: null };
    if (f >= 1) return { ...g, state: 'final', quarter: 'F', clock: '', elapsed: 1, homeScore: null, awayScore: null };
    const played = f * 60;
    const q = Math.min(4, Math.floor(played / 15) + 1);
    const left = q * 15 - played;
    const mm = Math.floor(left), ss = Math.floor((left - mm) * 60);
    return { ...g, state: 'live', quarter: String(q), clock: `${mm}:${String(ss).padStart(2, '0')}`, elapsed: f, homeScore: null, awayScore: null };
  };

  const build = (): LiveSnapshot => {
    const gs = games.map(gameAt);
    const byTeam = new Map<string, { f: number }>();
    games.forEach((g, i) => { const f = gs[i]!.elapsed ?? 0; byTeam.set(g.home, { f }); byTeam.set(g.away, { f }); });
    const complete = t >= total;
    const rows: LiveRow[] = finals.map((r) => {
      const pp: Record<string, number> = {};
      for (const pid of r.players) {
        const fin = r.playersPoints[pid] ?? 0;
        const team = o.teamOf(pid);
        const f = complete ? 1 : (team ? byTeam.get(team)?.f : undefined) ?? (byTeam.values().next().value?.f ?? 0);
        pp[pid] = pointsAt(chunksOf(pid, fin), fin, f);
      }
      const startersPoints = r.starters.map((pid) => pp[pid] ?? 0);
      return {
        ...r, playersPoints: pp, startersPoints,
        points: complete ? r.points : r2(startersPoints.reduce((s, x) => s + x, 0)),
      };
    });
    return { week: o.week, at: now(), clock: simToReal(Math.min(t, total)), kind: 'replay', rows, games: gs, gamesKnown: true, complete };
  };

  return {
    kind: 'replay',
    async poll() { advance(); return build(); },
    play() { advance(); playing = true; },
    pause() { advance(); playing = false; },
    setSpeed(s) { advance(); speed = s; },
    restart() { t = 0; last = now(); playing = true; },
    seek(fr) { advance(); t = Math.max(0, Math.min(total, fr * total)); },
    status() {
      advance();
      return { playing, speed, fraction: t / total, clock: simToReal(Math.min(t, total)), complete: t >= total };
    },
  };
}
