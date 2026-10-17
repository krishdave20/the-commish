/* What-if state and the valuation functions that read it (ports of val, range, irEstimate, myRoster,
   otherRoster, teamMeans and the lineup wrapper from reference/ff_live.js).

   A Scenario is a plain, JSON-serializable object, so it can live in React state, a URL, localStorage or a
   worker message. Overrides only ever apply to the chosen team ("mine"); every other team plays its
   model values. */
import { optimizeLineup, bestTotal, type LineupResult } from './lineup.ts';
import type { ByWeek, Model, ModelPlayer, ModelTeam } from './types.ts';

export interface PlayerOverride {
  /** he is out until this week (value 0 before it); after it he gets his IR estimate unless `ppg` is set */
  returnWeek?: number;
  /** points per game to use in every week he has a game */
  ppg?: number;
}

export interface Scenario {
  /** pid -> override */
  overrides: Record<string, PlayerOverride>;
  /** free agents (or anyone) added to the roster */
  adds: string[];
  /** rostered players dropped */
  drops: string[];
  /** "always start" */
  pins: string[];
  /** "never start" */
  benches: string[];
  /** multiplier on the weekly score SD (1 = model) */
  volatility: number;
}

export const emptyScenario = (): Scenario => ({ overrides: {}, adds: [], drops: [], pins: [], benches: [], volatility: 1 });

export const isScenarioActive = (s: Scenario): boolean =>
  Object.keys(s.overrides).length > 0 || s.adds.length > 0 || s.drops.length > 0 || s.pins.length > 0 || s.benches.length > 0 || s.volatility !== 1;

/** Toggle membership in one of the list fields, returning a new scenario. */
export function toggleIn(s: Scenario, field: 'adds' | 'drops' | 'pins' | 'benches', pid: string): Scenario {
  const has = s[field].includes(pid);
  return { ...s, [field]: has ? s[field].filter((x) => x !== pid) : [...s[field], pid] };
}

/** Set (or with `null`, clear) a player's override, returning a new scenario. */
export function withOverride(s: Scenario, pid: string, o: PlayerOverride | null): Scenario {
  const overrides = { ...s.overrides };
  if (o && (o.returnWeek || o.ppg != null)) overrides[pid] = o; else delete overrides[pid];
  return { ...s, overrides };
}

/** Plain-English list of what a scenario changes (the reference's "scenWords"). */
export function describeScenario(model: Model, s: Scenario): string[] {
  const idx = indexModel(model);
  const name = (pid: string) => idx.P[pid]?.name ?? pid;
  const w: string[] = [];
  for (const [pid, o] of Object.entries(s.overrides)) {
    if (!idx.P[pid]) continue;
    const bits: string[] = [];
    if (o.returnWeek) bits.push(`back week ${o.returnWeek}`);
    if (o.ppg != null) bits.push(`${o.ppg.toFixed(1)} pts/game`);
    w.push(`${name(pid)} ${bits.join(', ')}`);
  }
  if (s.adds.length) w.push('add ' + s.adds.map(name).join(', '));
  if (s.drops.length) w.push('drop ' + s.drops.map(name).join(', '));
  if (s.pins.length) w.push('always start ' + s.pins.map(name).join(', '));
  if (s.benches.length) w.push('never start ' + s.benches.map(name).join(', '));
  if (s.volatility !== 1) w.push(`weekly swing ${s.volatility.toFixed(2)}×`);
  return w;
}

/* ---------- model index ---------- */

export interface ModelIndex {
  P: Record<string, ModelPlayer>;
  byRid: Record<number, ModelTeam>;
  /** cur..maxWeek */
  weeks: number[];
}
const indexes = new WeakMap<Model, ModelIndex>();
export function indexModel(model: Model): ModelIndex {
  let ix = indexes.get(model);
  if (!ix) {
    const P: Record<string, ModelPlayer> = {};
    for (const p of model.players) P[p.pid] = p;
    const byRid: Record<number, ModelTeam> = {};
    for (const t of model.teams) byRid[t.rid] = t;
    const weeks: number[] = [];
    for (let w = model.meta.currentWeek; w <= model.meta.maxWeek; w++) weeks.push(w);
    ix = { P, byRid, weeks };
    indexes.set(model, ix);
  }
  return ix;
}

/* ---------- scope: a model + scenario + chosen team, with the valuation functions bound ---------- */

export type Means = Record<number, ByWeek<number>>;

export interface LineupOverrides { pins?: ReadonlySet<string>; benches?: ReadonlySet<string> }

export interface Scope {
  model: Model;
  scenario: Scenario;
  meRid: number;
  idx: ModelIndex;
  hasGame(p: ModelPlayer, w: number): boolean;
  irEstimate(p: ModelPlayer): number;
  val(p: ModelPlayer, w: number, mine: boolean): number;
  range(p: ModelPlayer, w: number, mine: boolean): [number, number];
  myRoster(): string[];
  otherRoster(rid: number, w: number): string[];
  lineup(ids: readonly string[], w: number, mine: boolean, opt?: LineupOverrides): LineupResult<ModelPlayer>;
  total(ids: readonly string[], w: number, mine: boolean): number;
  teamMeans(myIds?: readonly string[], overrides?: Record<number, ByWeek<number>>): Means;
}

const otherBases = new WeakMap<Model, Means>();

export function createScope(model: Model, scenario: Scenario = emptyScenario(), meRid: number = model.meRid): Scope {
  const idx = indexModel(model);
  const cur = model.meta.currentWeek;
  const slots = model.meta.slots;
  const pins = new Set(scenario.pins), benches = new Set(scenario.benches);
  const none: ReadonlySet<string> = new Set();

  const hasGame = (p: ModelPlayer, w: number) => !!p.opp[w] && p.opp[w] !== 'BYE';
  const irEstimate = (p: ModelPlayer) => {
    const v = idx.weeks.filter((w) => w > cur).map((w) => p.mu[w] || 0).filter((x) => x > 0);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : (p.seasonAvg || 0);
  };
  const val = (p: ModelPlayer, w: number, mine: boolean) => {
    const base = p.mu[w] || 0;
    if (!mine) return base;
    const o = scenario.overrides[p.pid];
    if (!o) return base;
    if (o.returnWeek && w < o.returnWeek) return 0;
    if (w === cur && p.playedThisWeek) return base;
    if (o.ppg != null) return hasGame(p, w) ? o.ppg : 0;
    if (o.returnWeek && base === 0 && hasGame(p, w)) return irEstimate(p);
    return base;
  };
  const range = (p: ModelPlayer, w: number, mine: boolean): [number, number] => {
    const v = val(p, w, mine), b = p.mu[w] || 0;
    const r: [number, number] = b > 0 ? [(p.lo[w] ?? 0) / b, (p.hi[w] ?? 0) / b] : (model.meta.floorCeil[p.pos] ?? [0.5, 1.5]);
    if (w === cur && p.playedThisWeek) return [v, v];
    return [v * r[0], v * r[1]];
  };
  const myBase = () => model.players.filter((p) => p.ownerRid === meRid).map((p) => p.pid);
  const myRoster = () => {
    const drops = new Set(scenario.drops);
    return myBase().filter((id) => !drops.has(id)).concat(scenario.adds);
  };
  const otherRoster = (rid: number, w: number) => model.players.filter((p) => p.ownerRid === rid && (!p.onIr || w >= cur + 4)).map((p) => p.pid);

  const lineup = (ids: readonly string[], w: number, mine: boolean, opt: LineupOverrides = {}): LineupResult<ModelPlayer> => {
    const pl = ids.map((id) => idx.P[id]).filter((p): p is ModelPlayer => !!p);
    let locked: Array<ModelPlayer | null> | undefined;
    if (mine && w === cur) {
      const have = new Set(ids);
      locked = (idx.byRid[meRid]?.starters ?? []).map((pid) => {
        const p = idx.P[pid];
        return p && p.playedThisWeek && have.has(pid) ? p : null;
      });
    }
    return optimizeLineup(pl, slots, {
      value: (p) => val(p, w, mine),
      locked,
      unavailable: w === cur ? (p) => p.playedThisWeek : undefined,
      pins: mine ? (opt.pins ?? pins) : none,
      benches: mine ? (opt.benches ?? benches) : none,
    });
  };
  const total = (ids: readonly string[], w: number, mine: boolean) => lineup(ids, w, mine).total;

  const teamMeans = (myIds?: readonly string[], overrides?: Record<number, ByWeek<number>>): Means => {
    let base = otherBases.get(model);
    if (!base) {
      base = {};
      for (const t of model.teams) {
        const row: ByWeek<number> = {};
        for (let w = cur; w <= model.meta.maxWeek; w++) {
          row[w] = w === cur ? (t.exp[w] ?? 0) : bestTotal(otherRoster(t.rid, w).map((id) => idx.P[id]!).filter(Boolean), slots, (p) => p.mu[w] || 0);
        }
        base[t.rid] = row;
      }
      otherBases.set(model, base);
    }
    const m: Means = {};
    for (const t of model.teams) m[t.rid] = { ...base[t.rid]! };
    const ids = myIds ?? myRoster();
    if (m[meRid]) for (let w = cur; w <= model.meta.maxWeek; w++) m[meRid][w] = total(ids, w, true);
    if (overrides) for (const rid of Object.keys(overrides)) Object.assign(m[Number(rid)]!, overrides[Number(rid)]);
    return m;
  };

  return { model, scenario, meRid, idx, hasGame, irEstimate, val, range, myRoster, otherRoster, lineup, total, teamMeans };
}

/* ---------- standalone wrappers (same names as the reference) ---------- */

export const val = (model: Model, s: Scenario, p: ModelPlayer, w: number, mine: boolean, meRid?: number) => createScope(model, s, meRid).val(p, w, mine);
export const range = (model: Model, s: Scenario, p: ModelPlayer, w: number, mine: boolean, meRid?: number) => createScope(model, s, meRid).range(p, w, mine);
export const irEstimate = (model: Model, p: ModelPlayer) => createScope(model).irEstimate(p);
export const myRoster = (model: Model, s: Scenario, meRid?: number) => createScope(model, s, meRid).myRoster();
export const otherRoster = (model: Model, rid: number, w: number) => createScope(model).otherRoster(rid, w);
export const teamMeans = (model: Model, s: Scenario = emptyScenario(), meRid?: number, myIds?: readonly string[], overrides?: Record<number, ByWeek<number>>): Means =>
  createScope(model, s, meRid).teamMeans(myIds, overrides);
export const lineup = (model: Model, s: Scenario, ids: readonly string[], w: number, mine: boolean, meRid?: number, opt?: LineupOverrides) =>
  createScope(model, s, meRid).lineup(ids, w, mine, opt);
