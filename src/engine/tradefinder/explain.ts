/* The one-line, rule-based explanation of a finder idea, and the "tier after the deal" it quotes. Every number in the sentence is a
   number on the idea: no model, no LLM.

   Two-team shape:
     "fills your qb need (+2.8 a week) by sending wr depth you never start. they gain +1.1 a week and their wr tier goes from thin to average."
   Rotation shape:
     "fills your qb need (+2.8 a week) by sending wr depth you never start to Nishzzz. Nishzzz gain +1.1 a week and their wr tier goes from
      thin to average; Saul gain +0.9 a week. every lineup gains."
   Dynasty ideas end with the FantasyCalc balance. */
import { rateTeams, type DynastyFacts, type GroupKey, type Tier } from '../draft/ratings.ts';
import type { Model, ModelPlayer } from '../types.ts';
import type { FinderIdea, FinderSide } from './types.ts';

interface Swap { rid: number; send: readonly ModelPlayer[]; get: readonly ModelPlayer[]; drop: ModelPlayer | null }

/** Group tiers for every team as if the swaps (and drops) had happened: the same ratings, run on the rosters after the deal. */
export function tiersAfter(model: Model, swaps: readonly Swap[], dynasty: Readonly<Record<number, DynastyFacts>> | null = null): Map<number, Partial<Record<GroupKey, Tier>>> {
  const owner = new Map<string, number>();
  for (const s of swaps) {
    for (const p of s.get) owner.set(p.pid, s.rid);
    if (s.drop) owner.set(s.drop.pid, 0);
  }
  const players = model.players.map((p) => (owner.has(p.pid) ? { ...p, ownerRid: owner.get(p.pid)! } : p));
  const r = rateTeams({ model: { ...model, players }, dynasty });
  const out = new Map<number, Partial<Record<GroupKey, Tier>>>();
  for (const t of r.teams) {
    const m: Partial<Record<GroupKey, Tier>> = {};
    for (const g of t.groups) m[g.key] = g.tier;
    out.set(t.rid, m);
  }
  return out;
}

const plus = (x: number) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(1)}`;
const lc = (s: string) => s.toLowerCase();
const int = (n: number) => Math.round(n).toLocaleString('en-US');
const groupWord = (g: GroupKey | null) => (g ? lc(g) : 'lineup');
const posList = (xs: readonly { pos: string }[]) => [...new Set(xs.map((p) => lc(p.pos)))].join('/');

export interface ExplainFacts {
  /** regular-season weeks in which one of the players you send starts for you now */
  sendStarts: number;
  /** regular-season weeks scored */
  regWeeks: number;
  /** one-for-two: what the second player adds, in points over the scored weeks */
  extraGain: number;
  rosterSize: number;
}

/** "wr depth you never start" / "a wr you start in 3 of 9 weeks" */
function sendPhrase(side: FinderSide, f: ExplainFacts): string {
  const pos = posList(side.send);
  if (f.sendStarts === 0) return `${pos} depth you never start`;
  return `${side.send.length > 1 ? `${pos} players` : `a ${pos}`} you start in ${f.sendStarts} of ${f.regWeeks} weeks`;
}

/** "their wr tier goes from thin to average" / "their wr tier stays thin" */
function tierPhrase(side: FinderSide, possessive: string): string {
  if (!side.tier || !side.group) return '';
  const g = groupWord(side.group);
  return side.tier.before === side.tier.after
    ? `${possessive} ${g} tier stays ${side.tier.before}`
    : `${possessive} ${g} tier goes from ${side.tier.before} to ${side.tier.after}`;
}

export function explainIdea(idea: FinderIdea, f: ExplainFacts): string {
  const me = idea.sides[0]!;
  const lead = `fills your ${groupWord(me.group)} need (${plus(me.perWeek)} a week)`;
  let text: string;
  if (idea.kind === 'three-team') {
    const b = idea.sides[1]!, c = idea.sides[2]!;
    const bTier = tierPhrase(b, 'their');
    const cTier = tierPhrase(c, 'their');
    text = `${lead} by sending ${sendPhrase(me, f)} to ${b.team}. ${b.team} gains ${plus(b.perWeek)} a week${bTier ? ` and ${bTier}` : ''}; ${c.team} gains ${plus(c.perWeek)} a week${cTier ? ` and ${cTier}` : ''}. every lineup gains, and the smallest gain is ${plus(idea.minGain / idea.weeks)} a week.`;
  } else {
    const they = idea.sides[1]!;
    const tp = tierPhrase(they, 'their');
    const extra = idea.kind === 'one-for-two' && idea.sides[0]!.get[1] ? ` ${idea.sides[0]!.get[1]!.name} comes along and adds ${plus(f.extraGain / idea.weeks)} a week.` : '';
    const need = they.fillsNeed ? ` (their ${groupWord(they.group)} need)` : '';
    // a partner who ends exactly level loses nothing, which is all the rule asks of them: say that, not "+0.0"
    const flat = Math.abs(they.perWeek) < 0.05;
    const theirs = flat ? `their lineup stays level (no points lost)${tp ? `, and ${tp}` : ''}` : `they gain ${plus(they.perWeek)} a week${need}${tp ? ` and ${tp}` : ''}`;
    text = `${lead} by sending ${sendPhrase(me, f)}.${extra} ${theirs}.`;
  }
  const v = idea.sides.find((s) => s.isMe)?.value;
  if (v) {
    const lean = v.leans === 'even' ? 'about even' : `${Math.round(v.gap * 100)}% apart, ${v.leans === 'for' ? 'in your favour' : 'against you'}`;
    text += ` dynasty value: you send ${int(v.out)} and get ${int(v.in)} (${lean}).`;
    if (idea.lopsided) text += ' lopsided: expect pushback.';
  }
  return text;
}
