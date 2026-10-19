/* Trade finder: need-driven 2-for-1, 1-for-2 and three-team ideas for one team (default: the signed-in team).

   WHAT IT LOOKS FOR. The ratings (src/engine/draft/ratings.ts) name each team's biggest NEED (the position group furthest below the league)
   and its SURPLUS (the position whose bench depth is furthest above it). An idea sends surplus-position players and brings back a
   player at your need. Gains are lineup points, the way evaluateTrade counts them: each side's best lineup with and without the deal,
   summed over the rest of the regular season (weeks cur+1 .. last) and the playoff weeks. No LLM, no value model: rules and the model's numbers.

   THE SEARCH (what is tried, and what is thrown away early)
   1. POOLS. You send from SEND_POOL players at your surplus position (the best by rest-of-season points; if you have no surplus, the
      bench players who start in under half your weeks). You receive from the RECEIVE_PER_TEAM best players at your need position on each other
      team (a FLEX need means any RB / WR / TE). No K, DEF, IDP or injured-reserve players. Nothing outside these pools is ever scored.
      Deals count from NEXT week (like evaluateTrade), so a player who already played this week is fine and this week's lineup is untouched.
   2. TWO-FOR-ONE: every pair from your send pool for every receive candidate. KEEP only if you gain at least FINDER_MIN_MY_GAIN points,
      then only if the partner's lineup does not lose points (their gain is at least FINDER_MIN_THEIR_GAIN, 0) AFTER they drop their cheapest
      bench player when the deal takes them over the roster limit. Your own gain is checked first because it is the cheaper test and kills most pairs.
   3. ONE-FOR-TWO: one send, and from one partner two players: one at your need, one more (a skill-position player the partner starts in
      under half their weeks, the EXTRA_POOL best by points). KEEP only if each of the two is worth at least FINDER_MIN_EXTRA points on top
      of the other (otherwise it is a plain one-for-one, which the handshake deals already list), and, because you take on a player,
      after YOUR cheapest bench player is dropped when you are at the limit.
   4. THREE-TEAM ROTATIONS (you → B → C → you, one player each): you send x to B, B sends y to C, C sends z to you. z is a player at your need
      on C; y is a player on B at a position C needs; x is from your send pool. Every leg is scored from lineups and the search stops at the first
      leg that fails: you must gain FINDER_MIN_MY_GAIN, and B and C each FINDER_MIN_OTHER_GAIN. Single swaps are memoized, so the same
      (team, player out, player in) is scored once however many rotations reuse it.
   5. RANK each kind by the smallest gain among the sides (so a lopsided deal ranks low), one idea per incoming player, at most
      FINDER_PER_PARTNER per partner, FINDER_PER_KIND per kind.

   ROSTER SIZE. A side that ends above the roster limit drops the bench player whose loss costs its lineup the fewest points over the same weeks
   (ties: the lowest rest-of-season points). The drop is part of the numbers and is shown on the idea. The limit comes from the league's
   roster_positions (pass `rosterSize`); without it, the biggest active roster in the league.

   DYNASTY. With FantasyCalc `values` each side gets value out and in, and an idea is flagged lopsided when any side is more than
   FINDER_LOPSIDED_GAP (15%) of the bigger side apart. The flag changes nothing in the ranking: the lineup gains still decide it. */
import { bestSet, bestTotal, ELIG } from '../lineup.ts';
import { createScope, emptyScenario, type Scenario } from '../scenario.ts';
import { rateTeams, type DynastyFacts, type GroupKey, type Ratings } from '../draft/ratings.ts';
import type { Model, ModelPlayer, ModelTeam, Pos } from '../types.ts';
import { explainIdea, tiersAfter } from './explain.ts';
import type { FinderIdea, FinderKind, FinderPlayer, FinderResult, FinderSide, Prefill, ValueBalance } from './types.ts';

export const FINDER_MIN_MY_GAIN = 2;
export const FINDER_MIN_THEIR_GAIN = 0;
export const FINDER_MIN_OTHER_GAIN = 0.25;
export const FINDER_MIN_EXTRA = 1.5;
export const FINDER_LOPSIDED_GAP = 0.15;
export const FINDER_PER_KIND = 6;
export const FINDER_PER_PARTNER = 2;
export const SEND_POOL = 7;
export const RECEIVE_PER_TEAM = 4;
export const EXTRA_POOL = 5;
export const ROTATION_SEND = 5;
export const ROTATION_RECEIVE = 3;
export const ROTATION_MIDDLE = 3;

const SKILL: ReadonlySet<string> = new Set(['QB', 'RB', 'WR', 'TE']);
const isSkill = (p: ModelPlayer) => SKILL.has(p.pos);

export interface FinderOptions {
  scenario?: Scenario;
  /** the team to find ideas for (default: the signed-in team) */
  rid?: number;
  /** roster limit counting bench but not injured reserve (league roster_positions without IR / TAXI) */
  rosterSize?: number;
  /** dynasty: Sleeper id → FantasyCalc value (null = none on file). Omit in a redraft league. */
  values?: Readonly<Record<string, number | null>> | null;
  /** dynasty facts for the ratings (only tiers are used here, so usually left out) */
  dynasty?: Readonly<Record<number, DynastyFacts>> | null;
  /** which kinds to search (default all three) */
  kinds?: readonly FinderKind[];
}

const pidKey = (xs: readonly ModelPlayer[]) => xs.map((p) => p.pid).sort().join(',');

/** Positions that fill the league's flex slots (RB / WR / TE, and QB when there is a superflex). */
export function flexPositions(slots: readonly string[]): Pos[] {
  const out = new Set<string>();
  for (const s of slots) {
    const el = ELIG[s];
    if (el && el.length > 1 && el.every((p) => SKILL.has(p))) for (const p of el) out.add(p);
  }
  return [...out] as Pos[];
}

/** The positions a need group means: a position group is itself; FLEX is every flex-eligible position. */
export function needPositions(group: GroupKey | null, slots: readonly string[]): Pos[] {
  if (!group) return [];
  return group === 'FLEX' ? flexPositions(slots) : [group];
}

export interface Gain { reg: number; po: number }
const total = (g: Gain) => g.reg + g.po;

/** Everything the search reads, bound to one model, scenario and team. */
export function createLineupEval(model: Model, scenario: Scenario, meRid: number) {
  const sc = createScope(model, scenario, meRid);
  const { currentWeek: cur, lastRegularWeek: last, slots } = model.meta;
  const regW: number[] = [];
  for (let w = cur + 1; w <= last; w++) regW.push(w);
  const poW = model.meta.playoffWeeks.length ? [...model.meta.playoffWeeks] : [last + 1];
  const allW = [...regW, ...poW];

  const rosterOf = (rid: number): ModelPlayer[] =>
    rid === meRid ? sc.myRoster().map((id) => sc.idx.P[id]).filter((p): p is ModelPlayer => !!p) : model.players.filter((p) => p.ownerRid === rid);
  const val = (rid: number, p: ModelPlayer, w: number) => (rid === meRid ? sc.val(p, w, true) : p.mu[w] || 0);
  const avail = (p: ModelPlayer, w: number) => !p.onIr || w >= cur + 4;
  const sum = (rid: number, players: readonly ModelPlayer[], ws: readonly number[]) => {
    let s = 0;
    for (const w of ws) s += bestTotal(players.filter((p) => avail(p, w)), slots, (p) => val(rid, p, w));
    return s;
  };
  const sums = (rid: number, players: readonly ModelPlayer[]): Gain => ({ reg: sum(rid, players, regW), po: sum(rid, players, poW) });
  const rosOf = (rid: number, p: ModelPlayer) => regW.reduce((s, w) => s + val(rid, p, w), 0);

  const rosters = new Map<number, ModelPlayer[]>();
  const roster = (rid: number) => { let r = rosters.get(rid); if (!r) { r = rosterOf(rid); rosters.set(rid, r); } return r; };
  const bases = new Map<number, Gain>();
  const base = (rid: number) => { let b = bases.get(rid); if (!b) { b = sums(rid, roster(rid)); bases.set(rid, b); } return b; };
  const memo = new Map<string, Gain>();

  /** Change in team `rid`'s best lineup when `leave` go and `arrive` come (and `drop` goes too). */
  function gain(rid: number, leave: readonly ModelPlayer[], arrive: readonly ModelPlayer[], drop?: ModelPlayer | null): Gain {
    const key = `${rid}|${pidKey(leave)}|${pidKey(arrive)}|${drop?.pid ?? ''}`;
    let g = memo.get(key);
    if (g) return g;
    const out = new Set(leave.map((p) => p.pid));
    const after = roster(rid).filter((p) => !out.has(p.pid) && p !== drop).concat(arrive);
    const s = sums(rid, after), b = base(rid);
    g = { reg: s.reg - b.reg, po: s.po - b.po };
    memo.set(key, g);
    return g;
  }

  /** Active (non-IR) players on the roster. */
  const count = (rid: number) => roster(rid).filter((p) => !p.onIr).length;

  /** The bench player whose loss costs the lineup least over the scored weeks (ties: fewest rest-of-season points). */
  function pickDrop(rid: number, after: readonly ModelPlayer[], keep: ReadonlySet<string>): ModelPlayer | null {
    const full = sums(rid, after);
    let best: { p: ModelPlayer; cost: number; ros: number } | null = null;
    for (const c of after) {
      if (c.onIr || keep.has(c.pid)) continue;
      const rest = sums(rid, after.filter((p) => p !== c));
      const cost = total(full) - total(rest), ros = rosOf(rid, c);
      if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && (ros < best.ros - 1e-9 || (Math.abs(ros - best.ros) <= 1e-9 && c.pid < best.p.pid)))) best = { p: c, cost, ros };
    }
    return best?.p ?? null;
  }

  /** Weeks of the regular season in which a player on `roster` is in the best lineup. */
  function startWeeks(rid: number, players: readonly ModelPlayer[], pids: ReadonlySet<string>): number {
    let n = 0;
    for (const w of regW) {
      const used = bestSet(players.filter((p) => avail(p, w)), slots, (p) => val(rid, p, w)).used;
      for (const id of pids) if (used.has(id)) { n++; break; }
    }
    return n;
  }

  return { model, sc, meRid, regW, poW, allW, roster, rosOf, val, gain, count, pickDrop, startWeeks, base, sums };
}
export type LineupEval = ReturnType<typeof createLineupEval>;

interface Cand {
  kind: FinderKind;
  /** one per side, you first */
  legs: Array<{ team: ModelTeam; send: ModelPlayer[]; get: ModelPlayer[]; drop: ModelPlayer | null; g: Gain }>;
  key: string;
  partnerKey: string;
  min: number;
  /** regular-season weeks the incoming need player starts for you */
  starts: number;
}

const fp = (ev: LineupEval, rid: number, p: ModelPlayer, values: FinderOptions['values']): FinderPlayer => ({
  pid: p.pid, name: p.name, pos: p.pos, nfl: p.nfl, ros: ev.rosOf(rid, p), value: values ? values[p.pid] ?? null : null,
});

function valueBalance(send: readonly FinderPlayer[], get: readonly FinderPlayer[]): ValueBalance {
  const out = send.reduce((s, p) => s + (p.value ?? 0), 0), inn = get.reduce((s, p) => s + (p.value ?? 0), 0);
  const big = Math.max(out, inn);
  const gap = big > 0 ? Math.abs(inn - out) / big : 0;
  return {
    out, in: inn, gap, lopsided: gap > FINDER_LOPSIDED_GAP, leans: gap <= 0.05 ? 'even' : inn > out ? 'for' : 'against',
    missing: [...send, ...get].filter((p) => p.value === null).map((p) => p.name),
  };
}

/** The ideas for one team. Pure; ~100 to 300 ms on a 12-team league. */
export function findTradeIdeas(model: Model, opts: FinderOptions = {}): FinderResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const scenario = opts.scenario ?? emptyScenario();
  const meRid = opts.rid ?? model.meRid;
  const kinds = new Set<FinderKind>(opts.kinds ?? ['two-for-one', 'one-for-two', 'three-team']);
  const ev = createLineupEval(model, scenario, meRid);
  const { slots } = model.meta;
  const others = model.teams.filter((t) => t.rid !== meRid);
  const me = model.teams.find((t) => t.rid === meRid);
  const ratings: Ratings = rateTeams({ model, dynasty: opts.dynasty ?? null });
  const mine = ratings.teams.find((t) => t.rid === meRid);
  const rosterSize = opts.rosterSize ?? Math.max(0, ...model.teams.map((t) => ev.count(t.rid)));
  const empty = (reason: string, usedBench = false): FinderResult => ({
    ideas: [], need: mine?.need ?? null, surplus: mine?.surplus ?? null,
    needTier: mine && mine.need ? mine.groups.find((g) => g.key === mine.need)?.tier ?? null : null,
    surplusTier: mine && mine.surplus ? mine.groups.find((g) => g.key === mine.surplus)?.tier ?? null : null,
    usedBench, reason, rosterSize, evaluated: 0, ms: clock() - t0,
  });
  if (!me || !mine || others.length === 0) return empty('this league needs at least two teams.');
  if (ev.allW.length === 0) return empty('there are no weeks left to score.');
  if (!mine.need) return empty('the league starts no position group to fill.');

  const need: GroupKey = mine.need;
  const needPos = needPositions(need, slots);
  const myRoster = ev.roster(meRid);
  // the deal counts from next week on, so a player who already played this week is fine
  const tradable = (p: ModelPlayer) => isSkill(p) && !p.onIr;

  // ---- your send pool
  const byRos = (rid: number) => (a: ModelPlayer, b: ModelPlayer) => ev.rosOf(rid, b) - ev.rosOf(rid, a) || a.pid.localeCompare(b.pid);
  let usedBench = false;
  let sendPool: ModelPlayer[];
  if (mine.surplus) {
    sendPool = myRoster.filter((p) => tradable(p) && p.pos === mine.surplus).sort(byRos(meRid)).slice(0, SEND_POOL);
  } else {
    usedBench = true;
    sendPool = myRoster.filter((p) => tradable(p) && !needPos.includes(p.pos) && ev.startWeeks(meRid, myRoster, new Set([p.pid])) * 2 < ev.regW.length)
      .sort(byRos(meRid)).slice(0, SEND_POOL);
  }
  if (sendPool.length === 0) return empty('you have no surplus to trade from: no position has spare depth.', usedBench);

  const teamRatings = new Map(ratings.teams.map((t) => [t.rid, t]));
  const topAt = (rid: number, pos: readonly string[], n: number, not?: ReadonlySet<string>) =>
    ev.roster(rid).filter((p) => tradable(p) && pos.includes(p.pos) && !(not && not.has(p.pid))).sort(byRos(rid)).slice(0, n);

  let evaluated = 0;
  const cands: Cand[] = [];
  // the player you bring in for your need has to start for you, like the handshake deals ask (at least 4 weeks, or every week left)
  const minStarts = Math.min(4, ev.regW.length);
  const startsFor = (after: readonly ModelPlayer[], incoming: readonly ModelPlayer[]) => ev.startWeeks(meRid, after, new Set(incoming.map((p) => p.pid)));
  const sendSets: ModelPlayer[][] = [...sendPool.map((p) => [p])];
  for (let i = 0; i < sendPool.length; i++) for (let j = i + 1; j < sendPool.length; j++) sendSets.push([sendPool[i]!, sendPool[j]!]);
  const keepOf = (xs: readonly ModelPlayer[]) => new Set(xs.map((p) => p.pid));

  /** Score a two-team deal; null when it fails a keep rule. */
  function twoWay(kind: FinderKind, partner: ModelTeam, send: ModelPlayer[], get: ModelPlayer[], needOnly?: ModelPlayer): Cand | null {
    evaluated++;
    const g1 = ev.gain(meRid, send, get);
    if (total(g1) < FINDER_MIN_MY_GAIN) return null;
    if (needOnly) {
      // each of the two has to earn his place: the extra player on top of the need player, and the need player on top of the extra
      const extra = get.find((p) => p !== needOnly)!;
      if (total(g1) - total(ev.gain(meRid, send, [needOnly])) < FINDER_MIN_EXTRA) return null;
      if (total(g1) - total(ev.gain(meRid, send, [extra])) < FINDER_MIN_EXTRA) return null;
    }
    const t1 = ev.gain(partner.rid, get, send);
    if (total(t1) < FINDER_MIN_THEIR_GAIN) return null;
    const dMine = get.length - send.length;
    const myAfter = myRoster.filter((p) => !send.includes(p)).concat(get);
    const thAfter = ev.roster(partner.rid).filter((p) => !get.includes(p)).concat(send);
    const myDrop = ev.count(meRid) + dMine > rosterSize ? ev.pickDrop(meRid, myAfter, keepOf(get)) : null;
    const thDrop = ev.count(partner.rid) - dMine > rosterSize ? ev.pickDrop(partner.rid, thAfter, keepOf(send)) : null;
    const g = myDrop ? ev.gain(meRid, send, get, myDrop) : g1;
    const t = thDrop ? ev.gain(partner.rid, get, send, thDrop) : t1;
    if (total(g) < FINDER_MIN_MY_GAIN || total(t) < FINDER_MIN_THEIR_GAIN) return null;
    const starts = startsFor(myAfter, needOnly ? [needOnly] : get);
    if (starts < minStarts) return null;
    return {
      kind, key: `${kind}:${pidKey(get)}`, partnerKey: String(partner.rid), min: Math.min(total(g), total(t)), starts,
      legs: [{ team: me!, send, get, drop: myDrop, g }, { team: partner, send: get, get: send, drop: thDrop, g: t }],
    };
  }

  // ---- two-for-one and one-for-two
  if (kinds.has('two-for-one') || kinds.has('one-for-two')) {
    for (const partner of others) {
      const wants = topAt(partner.rid, needPos, RECEIVE_PER_TEAM);
      if (kinds.has('two-for-one')) {
        for (const send of sendSets) {
          if (send.length !== 2) continue;
          for (const get of wants) { const c = twoWay('two-for-one', partner, send, [get]); if (c) cands.push(c); }
        }
      }
      if (kinds.has('one-for-two')) {
        // the second player is someone the partner mostly benches, so giving him up should not cost them lineup points
        const theirs = ev.roster(partner.rid);
        const extras = theirs.filter((p) => tradable(p) && ev.startWeeks(partner.rid, theirs, new Set([p.pid])) * 2 < ev.regW.length)
          .sort(byRos(partner.rid)).slice(0, EXTRA_POOL);
        for (const send of sendSets) {
          if (send.length !== 1) continue;
          for (const need of wants) {
            for (const extra of extras) {
              if (extra === need) continue;
              const c = twoWay('one-for-two', partner, send, [need, extra], need);
              if (c) cands.push(c);
            }
          }
        }
      }
    }
  }

  // ---- three-team rotations: you -> B -> C -> you
  if (kinds.has('three-team') && others.length >= 2) {
    const rot = sendPool.slice(0, ROTATION_SEND);
    for (const C of others) {
      const cNeeds = needPositions(teamRatings.get(C.rid)?.need ?? null, slots);
      if (cNeeds.length === 0) continue;
      for (const z of topAt(C.rid, needPos, ROTATION_RECEIVE)) {
        for (const x of rot) {
          evaluated++;
          const gA = ev.gain(meRid, [x], [z]);
          if (total(gA) < FINDER_MIN_MY_GAIN) continue;
          for (const B of others) {
            if (B.rid === C.rid) continue;
            for (const y of topAt(B.rid, cNeeds, ROTATION_MIDDLE)) {
              evaluated++;
              const gC = ev.gain(C.rid, [z], [y]);
              if (total(gC) < FINDER_MIN_OTHER_GAIN) continue;
              const gB = ev.gain(B.rid, [y], [x]);
              if (total(gB) < FINDER_MIN_OTHER_GAIN) continue;
              const starts = startsFor(myRoster.filter((p) => p !== x).concat([z]), [z]);
              if (starts < minStarts) continue;
              cands.push({
                kind: 'three-team', key: `three-team:${z.pid}`, partnerKey: `${B.rid}-${C.rid}`, starts,
                min: Math.min(total(gA), total(gB), total(gC)),
                legs: [
                  { team: me, send: [x], get: [z], drop: null, g: gA },
                  { team: B, send: [y], get: [x], drop: null, g: gB },
                  { team: C, send: [z], get: [y], drop: null, g: gC },
                ],
              });
            }
          }
        }
      }
    }
  }

  // ---- rank, one per incoming set, a couple per partner
  const chosen: Cand[] = [];
  for (const kind of ['two-for-one', 'one-for-two', 'three-team'] as const) {
    const list = cands.filter((c) => c.kind === kind).sort((a, b) => b.min - a.min || total(b.legs[0]!.g) - total(a.legs[0]!.g) || a.key.localeCompare(b.key));
    const seen = new Set<string>(), perPartner = new Map<string, number>();
    let n = 0;
    for (const c of list) {
      if (n >= FINDER_PER_KIND) break;
      const have = perPartner.get(c.partnerKey) ?? 0;
      if (seen.has(c.key) || have >= FINDER_PER_PARTNER) continue;
      seen.add(c.key); perPartner.set(c.partnerKey, have + 1); chosen.push(c); n++;
    }
  }

  const weeks = ev.allW.length;
  const ideas = chosen.map((c) => buildIdea(ev, c, ratings, opts, weeks, need, rosterSize));
  return {
    ideas, need: mine.need, surplus: mine.surplus,
    needTier: mine.groups.find((g) => g.key === mine.need)?.tier ?? null,
    surplusTier: mine.surplus ? mine.groups.find((g) => g.key === mine.surplus)?.tier ?? null : null,
    usedBench, evaluated, rosterSize, ms: clock() - t0,
    reason: ideas.length ? '' : 'no deal found where both sides gain: your surplus does not fix anyone else\'s lineup enough.',
  };
}

function buildIdea(ev: LineupEval, c: Cand, ratings: Ratings, opts: FinderOptions, weeks: number, needGroup: GroupKey, rosterSize: number): FinderIdea {
  const { model } = ev;
  const values = opts.values ?? null;
  const swaps = c.legs.map((l) => ({ rid: l.team.rid, send: l.send, get: l.get, drop: l.drop }));
  const after = tiersAfter(model, swaps, opts.dynasty ?? null);
  const sides: FinderSide[] = c.legs.map((l) => {
    const rt = ratings.teams.find((t) => t.rid === l.team.rid);
    const isMe = l.team.rid === ev.meRid;
    // you fill your need; everyone else gains at the position they receive
    const firstIn = l.get[0];
    const group: GroupKey | null = isMe ? needGroup : firstIn && ['QB', 'RB', 'WR', 'TE'].includes(firstIn.pos) ? (firstIn.pos as GroupKey) : null;
    const fillsNeed = isMe ? true : !!group && !!rt?.need && (rt.need === group || (rt.need === 'FLEX' && flexPositions(model.meta.slots).includes(group as Pos)));
    const key = group && !isMe && rt?.need === 'FLEX' && fillsNeed ? 'FLEX' : group;
    const before = key ? rt?.groups.find((g) => g.key === key)?.tier : undefined;
    const aft = key ? after.get(l.team.rid)?.[key] : undefined;
    const send = l.send.map((p) => fp(ev, l.team.rid, p, values)), get = l.get.map((p) => fp(ev, l.team.rid, p, values));
    return {
      rid: l.team.rid, team: l.team.team, isMe, send, get,
      drop: l.drop ? fp(ev, l.team.rid, l.drop, values) : null,
      reg: l.g.reg, po: l.g.po, gain: total(l.g), perWeek: total(l.g) / weeks,
      group: key, tier: before && aft ? { before, after: aft } : null, fillsNeed,
      value: values ? valueBalance(send, get) : null,
    };
  });
  const idea: FinderIdea = {
    id: `${c.kind}:${c.legs.map((l) => pidKey(l.send)).join('>')}`, kind: c.kind, sides, minGain: c.min, text: '', weeks,
    lopsided: sides.some((s) => s.value?.lopsided), startsForMe: c.starts,
  };
  idea.text = explainIdea(idea, {
    sendStarts: ev.startWeeks(ev.meRid, ev.roster(ev.meRid), new Set(c.legs[0]!.send.map((p) => p.pid))), regWeeks: ev.regW.length,
    extraGain: c.kind === 'one-for-two' ? total(ev.gain(ev.meRid, c.legs[0]!.send, c.legs[0]!.get)) - total(ev.gain(ev.meRid, c.legs[0]!.send, [c.legs[0]!.get[0]!])) : 0,
    rosterSize,
  });
  return idea;
}

/** What "load in analyzer" puts into the analyzer: the idea's two teams, or just your leg of a rotation. */
export function prefillFor(idea: FinderIdea): Prefill {
  const mine = idea.sides[0]!;
  if (idea.kind === 'three-team') {
    // the team that sends you your player is the last one in the rotation
    const from = idea.sides[idea.sides.length - 1]!;
    return { partnerRid: from.rid, send: mine.send.map((p) => p.pid), get: mine.get.map((p) => p.pid), partial: true };
  }
  const other = idea.sides[1]!;
  return { partnerRid: other.rid, send: mine.send.map((p) => p.pid), get: mine.get.map((p) => p.pid), partial: false };
}
