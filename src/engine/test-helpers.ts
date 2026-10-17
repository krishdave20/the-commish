/* Shared test helpers: the fixture-backed pull/model, and small hand-built leagues. */
import { createCache } from '../data/cache.ts';
import { createDataLayer } from '../data/index.ts';
import { fixtureDirSource } from '../data/fixtureNode.ts';
import { fixtureTransport, type FixtureManifest, type FixtureSource } from '../data/transport.ts';
import { bestTotal } from './lineup.ts';
import { loadLeaguePull } from './load.ts';
import { buildModel } from './model.ts';
import type { LeaguePull, Model, ModelGame, ModelPlayer, ModelTeam, Pos, Slot } from './types.ts';

export const FIXTURE_DIR = decodeURIComponent(new URL('../../reference/fixture', import.meta.url).pathname);

/** Node-only: read a UTF-8 text file (node:fs is loaded dynamically because the app tsconfig has no Node types). */
export async function readText(path: string): Promise<string> {
  const name = 'node:fs/promises';
  const fs = (await import(/* @vite-ignore */ name)) as unknown as { readFile(p: string, enc: string): Promise<string> };
  return fs.readFile(path, 'utf8');
}

const memos = new Map<boolean, Promise<{ src: FixtureSource; manifest: FixtureManifest; pull: LeaguePull; model: Model }>>();

/** Loads reference/fixture/ through the real data layer, loadLeaguePull and buildModel. Memoized per test file.
    `referenceCompat: true` builds the model with the reference engine's quirks (see BuildOpts). */
export function fixtureModel(o: { referenceCompat?: boolean } = {}) {
  const compat = !!o.referenceCompat;
  let memo = memos.get(compat);
  if (!memo) {
    memo = (async () => {
      const src = await fixtureDirSource(FIXTURE_DIR);
      const manifest = src.manifest;
      const captured = typeof manifest.captured_at === 'number' ? manifest.captured_at : Date.parse(manifest.captured_at);
      const layer = createDataLayer({ transport: fixtureTransport(src), cache: createCache({ memoryOnly: true }), now: () => captured });
      const pull = await loadLeaguePull(layer.sleeper, { leagueId: manifest.league_id, userId: manifest.user_id });
      const model = buildModel(pull, { userId: manifest.user_id, referenceCompat: compat });
      return { src, manifest, pull, model };
    })();
    memos.set(compat, memo);
  }
  return memo;
}

/* ---------- hand-built models ---------- */

export interface HandPlayer {
  pid: string;
  pos: Pos;
  /** points per week (a number, or a function of the week) */
  mu: number | ((w: number) => number);
  /** roster id; 0 = free agent */
  owner: number;
  name?: string;
  onIr?: boolean;
  played?: boolean;
  adds72h?: number;
  seasonAvg?: number | null;
  /** weeks with no game */
  bye?: number[];
}
export interface HandTeam { rid: number; name?: string; wins?: number; losses?: number; divId?: number; starters?: string[]; faab?: number; pf?: number }
export interface HandOpts {
  cur?: number;
  last?: number;
  slots: Slot[];
  teams: HandTeam[];
  players: HandPlayer[];
  /** [week, teamA, teamB] */
  games?: Array<[number, number, number]>;
  playoffTeams?: number;
  divisions?: number;
  sd?: number;
  meRid?: number;
}

/** A Model assembled by hand (no network, no projections) for exact-number tests. Playoff weeks are last+1..last+2. */
export function handModel(o: HandOpts): Model {
  const cur = o.cur ?? 5, last = o.last ?? 8, maxWeek = last + 2;
  const weeks: number[] = [];
  for (let w = cur; w <= maxWeek; w++) weeks.push(w);
  const players: ModelPlayer[] = o.players.map((hp) => {
    const p: ModelPlayer = {
      pid: hp.pid, name: hp.name ?? hp.pid, pos: hp.pos, nfl: 'XXX', ownerRid: hp.owner, onIr: !!hp.onIr, injury: '', body: '',
      seasonAvg: hp.seasonAvg ?? null, adds72h: hp.adds72h ?? 0, playedThisWeek: !!hp.played, pts: {}, mu: {}, lo: {}, hi: {}, opp: {}, dvp: {},
    };
    for (const w of weeks) {
      const bye = hp.bye?.includes(w);
      const m = bye ? 0 : typeof hp.mu === 'function' ? hp.mu(w) : hp.mu;
      p.mu[w] = m; p.lo[w] = m * 0.5; p.hi[w] = m * 1.5; p.opp[w] = bye ? 'BYE' : 'YYY'; p.dvp[w] = null;
    }
    return p;
  });
  const teams: ModelTeam[] = o.teams.map((t) => {
    const mine = players.filter((p) => p.ownerRid === t.rid);
    const exp: Record<number, number> = {};
    for (const w of weeks) exp[w] = bestTotal(mine.filter((p) => !p.onIr), o.slots, (p) => p.mu[w] ?? 0);
    return {
      rid: t.rid, team: t.name ?? `T${t.rid}`, manager: `m${t.rid}`, ownerId: `u${t.rid}`, division: 'League', divId: t.divId ?? t.rid,
      wins: t.wins ?? 0, losses: t.losses ?? 0, ties: 0, pf: t.pf ?? 0, pa: 0, faabLeft: t.faab ?? 100, isMe: t.rid === (o.meRid ?? o.teams[0]!.rid),
      starters: t.starters ?? [], livePts: 0, exp, playoffPct: 0, divWinPct: 0, expWins: 0, winsP10: 0, winsP90: 0, seedPct: [], status: 'Alive',
    };
  });
  const games: ModelGame[] = (o.games ?? []).map(([week, a, b]) => ({ id: `w${week}-${a}-${b}`, week, teamA: a, teamB: b }));
  return {
    meta: {
      method: 'projection', leagueId: 'L', leagueName: 'Hand League', season: '2026', username: 'me', userId: 'u1', maeProjection: null, bandCoverage: null,
      teamWeeklySd: o.sd ?? 20, simRuns: 20000, currentWeek: cur, lastRegularWeek: last, maxWeek, playoffWeeks: [last + 1, last + 2],
      playoffTeams: o.playoffTeams ?? 2, divisions: o.divisions ?? 0, waiverBudget: 100, slots: o.slots, scoring: '1 per catch', calibrationWeeks: [],
      floorCeil: { QB: [0.5, 1.5], RB: [0.5, 1.5], WR: [0.5, 1.5], TE: [0.5, 1.5], K: [0.5, 1.5], DEF: [0.5, 1.5] }, ratioSamples: {}, residualSd: {},
      positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'], asOf: 0, stale: false,
    },
    meRid: o.meRid ?? o.teams[0]!.rid, teams, players, games, history: [], ideas: [], oddsPending: false,
  };
}
