/* The engine's model, flattened to the plain data the moments rules read. Pure; nothing here touches the clock or the network. */
import { emptyScenario } from '../scenario.ts';
import type { Engine } from '../index.ts';
import type { ModelPlayer } from '../types.ts';
import type { InjuryRisk, LastResult, MomentModel, StarterInfo, Swap, WaiverTop } from './types.ts';

/** Swaps worth less than this together are noise (ties between near-equal players). */
const MIN_SWAP_TOTAL = 0.5;
const FLAGGED = /Questionable|Doubtful|Out|Suspended/;

export interface AdaptOpts {
  /** the week's NFL games are all over: the current week's score is a final result */
  weekOver?: boolean;
  /** the board's top add, computed apart because it is the slow part (`undefined`: not computed yet) */
  waiver?: MomentModel['waiver'];
  /** the non-playoff bracket the league plays: its name, the champion's title and which odds are mine */
  losers?: { name: string; champ: string; which: 'flush' | 'consolation' } | null;
}

/** The top of the waiver board in the form the rules use. Slow: run it off the main render. */
export function waiverInfo(engine: Engine, faab: boolean): MomentModel['waiver'] {
  const list = engine.waivers(emptyScenario(), 'reg').list;
  const first = list[0];
  if (!first) return { top: null, faab, adds: [] };
  const add = (e: (typeof list)[number]): WaiverTop => ({ pid: e.pid, name: e.player.name, pos: e.player.pos, gain: e.gain, bid: e.bid, dropName: e.drop.name });
  // the live activity shows the best two
  return { top: add(first), faab, adds: list.slice(0, 2).map(add) };
}

const flagged = (p: ModelPlayer) => FLAGGED.test(p.injury) && !p.playedThisWeek;

export function momentModel(engine: Engine, o: AdaptOpts = {}): MomentModel {
  const { model, me, meRid } = engine;
  const cur = model.meta.currentWeek;
  const scope = engine.scope(emptyScenario());
  const idx = scope.idx;

  /* this week's matchup, before the games */
  const row = model.history.find((h) => h.week === cur && h.rid === meRid);
  const game = model.games.find((g) => g.week === cur && (g.teamA === meRid || g.teamB === meRid));
  const oppRid = row?.opp ?? (game ? (game.teamA === meRid ? game.teamB : game.teamA) : null);
  const opp = oppRid === null || oppRid === undefined ? null : model.teams.find((t) => t.rid === oppRid) ?? null;
  const means = engine.teamMeans(emptyScenario());
  const matchup = opp
    ? (() => { const mine = means[meRid]?.[cur] ?? 0, theirs = means[opp.rid]?.[cur] ?? 0; return { oppName: opp.team, mine, theirs, p: engine.winProb(mine, theirs, 1) }; })()
    : null;

  /* the lineup set in Sleeper against the best one */
  const setIds = me.starters.filter((id) => id && id !== '0');
  const starters: StarterInfo[] = setIds.map((id) => idx.P[id]).filter((p): p is ModelPlayer => !!p)
    .map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, nfl: p.nfl, injury: p.injury, played: p.playedThisWeek }));
  const roster = scope.myRoster();
  const L = scope.lineup(roster, cur, true);
  const best = L.slots.filter((s) => s.p && !s.locked).map((s) => s.p as ModelPlayer);
  const ins = best.filter((p) => !setIds.includes(p.pid));
  const outs = setIds.map((id) => idx.P[id]).filter((p): p is ModelPlayer => !!p && !p.playedThisWeek && !best.includes(p));
  let swaps: Swap[] = ins.map((p, k) => {
    const out = outs[k] ?? null;
    return { inName: p.name, inPid: p.pid, outName: out ? out.name : null, gain: scope.val(p, cur, true) - (out ? scope.val(out, cur, true) : 0) };
  }).filter((x) => x.gain > 0.05).sort((a, b) => b.gain - a.gain);
  if (swaps.reduce((t, x) => t + x.gain, 0) < MIN_SWAP_TOTAL) swaps = [];
  const lineup = setIds.length > 0 || L.total > 0 ? { best: L.total, swaps } : null;

  /* starters on the injury report, and who could step in */
  const rostered = roster.map((id) => idx.P[id]).filter((p): p is ModelPlayer => !!p);
  const injuries: InjuryRisk[] = setIds.map((id) => idx.P[id]).filter((p): p is ModelPlayer => !!p && flagged(p)).map((p) => {
    const fb = rostered
      .filter((b) => b.pid !== p.pid && !setIds.includes(b.pid) && b.pos === p.pos && !b.onIr && !b.playedThisWeek && !/Doubtful|Out|Suspended/.test(b.injury) && scope.hasGame(b, cur))
      .sort((a, b) => scope.val(b, cur, true) - scope.val(a, cur, true))[0];
    return { pid: p.pid, name: p.name, pos: p.pos, status: p.injury.toLowerCase(), fallback: fb ? { name: fb.name, points: scope.val(fb, cur, true) } : null };
  });

  /* the race */
  const odds = model.oddsPending ? null : me.playoffPct;
  const des = engine.designations()[meRid];
  const w = engine.winsToClinch();
  const magic = des ? { spot: w.spot, open: w.open, winOut: w.winOut, clinched: des.clinch, eliminated: des.elim } : null;
  const losers = o.losers && !model.oddsPending
    ? { name: o.losers.name, champ: o.losers.champ, pct: (o.losers.which === 'flush' ? me.flushPct : me.consolationPct) ?? null, inPct: me.inToiletBowlPct ?? null }
    : null;

  /* the most recent finished week of mine */
  const results = model.history.filter((h) => h.rid === meRid);
  const done = o.weekOver ? results.find((h) => h.week === cur) : results.find((h) => h.week === cur - 1 && h.final);
  const nameOf = (rid: number) => model.teams.find((t) => t.rid === rid)?.team ?? `team ${rid}`;
  const lastResult: LastResult | null = done ? { week: done.week, mine: done.pts, theirs: done.oppPts, oppName: nameOf(done.opp) } : null;

  const idea = model.ideas[0];
  return {
    week: cur, lastRegularWeek: model.meta.lastRegularWeek, teamName: me.team,
    record: { w: me.wins, l: me.losses, t: me.ties }, matchup, starters, lineup, injuries,
    waiver: o.waiver ?? null, faabLeft: Number.isFinite(me.faabLeft) ? me.faabLeft : null, playoffPct: odds, magic, titlePct: model.oddsPending ? null : me.titlePct ?? null, losers, lastResult,
    trade: idea ? { give: idea.give, get: idea.get, partner: idea.partner, myGain: idea.myGain, theirGain: idea.theirGain } : null,
  };
}
