/* Turning candidates into takes and putting them in order: relevance (from ownership), the "why it matters for you" line,
   dedupe by id, the per-player-per-week cap, and the sort (relevance bucket, then score). */
import { waiverBoard } from '../engine/waivers.ts';
import type { Candidate } from './common.ts';
import { lineupSpot, renderCandidate, whyForYouLine } from './templates.ts';
import type { Relevance, Take, TakeInputs, TakeKind } from './types.ts';

/** Bucket order: your players, then waiver targets, then trade targets, then league-wide. */
export const RELEVANCE_ORDER: Record<Relevance, number> = { mine: 0, waiver: 1, trade_target: 2, league: 3 };

const KIND_ORDER: TakeKind[] = [
  'usage_spike', 'target_hog', 'waiver_riser', 'rz_role_change', 'buy_low', 'sell_high', 'box_count_edge', 'blitz_beater', 'soft_schedule',
  'dynasty_mover', 'coverage_note',
];

/** mine: on the signed-in team (model.meRid). waiver: a free agent (ownerRid 0). trade_target: on another roster AND in the
    watchlist or tradeTargets. league: everything else. */
export function relevanceOf(inputs: Pick<TakeInputs, 'model' | 'watchlist' | 'tradeTargets'>, pid: string): Relevance {
  const p = inputs.model.players.find((x) => x.pid === pid);
  if (!p) return 'league';
  if (p.ownerRid === inputs.model.meRid && p.ownerRid !== 0) return 'mine';
  if (p.ownerRid === 0) return 'waiver';
  if (inputs.watchlist.includes(pid) || inputs.tradeTargets.includes(pid)) return 'trade_target';
  return 'league';
}

/** Highest score first per id; ties keep the first seen. */
function dedupe(takes: Take[]): Take[] {
  const best = new Map<string, Take>();
  for (const t of takes) {
    const have = best.get(t.id);
    if (!have || t.score > have.score) best.set(t.id, t);
  }
  return [...best.values()];
}

/** Dedupe ids, keep at most `max` takes per player per week (the highest scoring), and sort by relevance bucket then score. */
export function rankTakes(takes: Take[], max: number): Take[] {
  const order = (t: Take) => [RELEVANCE_ORDER[t.relevance], -t.score, KIND_ORDER.indexOf(t.kind)] as const;
  const cmp = (a: Take, b: Take) => {
    const x = order(a), y = order(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
  const byPlayerWeek = new Map<string, Take[]>();
  for (const t of dedupe(takes)) {
    const key = `${t.pid}:${t.week}`;
    let a = byPlayerWeek.get(key);
    if (!a) byPlayerWeek.set(key, (a = []));
    a.push(t);
  }
  const kept: Take[] = [];
  for (const a of byPlayerWeek.values()) kept.push(...a.sort((p, q) => q.score - p.score || cmp(p, q)).slice(0, Math.max(0, max)));
  return kept.sort(cmp);
}

const BAD_TEXT = /\b(NaN|undefined|null|Infinity)\b/;

/** Fill in words, relevance and the why-line for each candidate. A candidate whose numbers cannot be formatted is dropped. */
export function toTakes(cands: Candidate[], inputs: TakeInputs): Take[] {
  const rel = new Map<string, Relevance>();
  for (const c of cands) if (!rel.has(c.pid)) rel.set(c.pid, relevanceOf(inputs, c.pid));
  let gains = inputs.waiverGains;
  let waiverKnown = !!gains;
  if (!gains && [...rel.values()].includes('waiver')) {
    try {
      gains = Object.fromEntries(waiverBoard(inputs.model).list.map((e) => [e.pid, e.gain]));
      waiverKnown = true;
    } catch {
      gains = undefined;
    }
  }
  const byPid = new Map(inputs.model.players.map((p) => [p.pid, p]));
  const out: Take[] = [];
  for (const c of cands) {
    let words: { headline: string; statLine: string };
    try { words = renderCandidate(c); } catch { continue; }
    const relevance = rel.get(c.pid)!;
    if (c.kind === 'coverage_note' && relevance === 'league') continue; // last-season splits are only worth a card when they touch your roster, the wire or a trade target
    const p = byPid.get(c.pid);
    const owner = p ? inputs.model.teams.find((t) => t.rid === p.ownerRid) : undefined;
    const whyForYou = whyForYouLine(relevance, {
      spot: p ? lineupSpot(inputs.model, p) : 'BN', waiverGain: gains?.[c.pid], waiverKnown, ownerTeam: owner?.team ?? 'another team',
    });
    if (BAD_TEXT.test(words.headline) || BAD_TEXT.test(words.statLine) || (whyForYou != null && BAD_TEXT.test(whyForYou))) continue;
    out.push({
      id: c.id, kind: c.kind, pid: c.pid, player: c.player, pos: c.pos, team: c.team, season: c.season, week: c.week, throughWeek: c.throughWeek,
      headline: words.headline, statLine: words.statLine, whyForYou, relevance, tone: c.tone, score: c.score, sample: c.sample,
      dataLabel: c.dataLabel, sources: c.sources, actions: c.actions, trackRecord: c.trackRecord ?? null,
    });
  }
  return out;
}
