/* "How to beat them": two or three keys, each a rule over numbers on screen. Candidates fire only when their data exists and clears a
   threshold; each carries a weight (a base per rule plus a little for the size of the number) and the three heaviest are shown.

   | rule        | fires when                                                            | says                                                                  | base |
   |-------------|-----------------------------------------------------------------------|-----------------------------------------------------------------------|------|
   | swing slot  | the biggest projection gap in one slot is at least SWING_MIN (1.5)    | "your flex vs their flex is the swing slot: projected +4.2 for them"  | 10   |
   | empty slot  | a slot of theirs has nobody in it                                     | "their te slot is empty: it scores nothing unless they fill it"       | 9    |
   | timing      | one side's last kickoff is at least LATE_GAP_MS (3 h) after the other's | "their qb plays monday night, after your last starter: they will know what they need" | 8 |
   | their star  | one starter carries at least STAKE_MIN (5) points of their win chance | "x carries their week: 14 points of win chance ride on him"            | 7    |
   | lineup      | their lineup is at least LEFT_MIN (2.0) short of optimal              | "their lineup is 5.4 short of optimal: if it stays, that is your edge" | 6   |
   | cover       | a starter of theirs is questionable / doubtful / out                  | "x is questionable: if he sits, y steps in at 8.1"                    | 5.5  |
   | habit       | they beat or miss projection by PROJECTION_BAND (2.0) a week, or leave HABIT_LEFT (5.0) a week | "they run 4.1 above projection a week" / "they leave 6.2 on the bench a week" | 4 |
   Not shown for a finished week (nothing left to act on). */
import { injuryClass, isLocked, plural, pts1, r1, signed1, slotName } from './format.ts';
import type { HingesResult } from '../hinges/index.ts';
import type { LineupScout } from './lineup.ts';
import { PROJECTION_BAND } from './tendencies.ts';
import type { Tendencies } from './tendencies.ts';
import { fits } from '../lineup.ts';
import type { ScoutLabels, ScoutPlayer, ScoutTeam } from './types.ts';

export const SWING_MIN = 1.5;
export const LATE_GAP_MS = 3 * 3_600_000;
export const STAKE_MIN = 5;
export const LEFT_MIN = 2;
export const HABIT_LEFT = 5;
export const MAX_KEYS = 3;

export type KeyKind = 'swing' | 'empty' | 'timing' | 'star' | 'lineup' | 'cover' | 'habit';
export interface Key {
  kind: KeyKind;
  text: string;
  weight: number;
  /** the player the key is about, for a headshot */
  player: ScoutPlayer | null;
  /** the figure in the sentence, for sorting and for tests */
  number: number;
}

export interface KeyInput {
  you: ScoutTeam;
  target: ScoutTeam;
  labels: ScoutLabels;
  lineup: LineupScout;
  hinges: HingesResult | null;
  tendencies: Tendencies;
}

const ET = 'America/New_York';

/** "monday night", "sunday afternoon", "thursday night": the NFL's own windows, read in US Eastern time. */
export function windowName(kickoff: number): string {
  const d = new Date(kickoff);
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: ET }).format(d).toLowerCase();
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: ET }).format(d));
  return `${day} ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'night'}`;
}

const stillToCome = (p: ScoutPlayer | null): p is ScoutPlayer => !!p && (p.state === 'pre' || p.state === 'live') && p.kickoff !== null;
const lastKickoff = (t: ScoutTeam): number | null => {
  const ks = t.starters.filter(stillToCome).map((p) => p.kickoff!);
  return ks.length ? Math.max(...ks) : null;
};
const nameList = (ps: ScoutPlayer[]) => (ps.length === 1 ? `${ps[0]!.pos.toLowerCase()} ${ps[0]!.name}` : ps.slice(0, 3).map((p) => p.name).join(' and '));

export function howToBeat(input: KeyInput): Key[] {
  const { you, target, labels: L, lineup, hinges, tendencies } = input;
  const keys: Key[] = [];

  // swing slot: the slot with the biggest projection gap between the two lineups, while it can still move
  let swing: { i: number; diff: number } | null = null;
  for (let i = 0; i < target.slots.length; i++) {
    const a = you.starters[i], b = target.starters[i];
    if (!a || !b || (!stillOpen(a) && !stillOpen(b))) continue;
    const diff = b.projection - a.projection;
    if (!swing || Math.abs(diff) > Math.abs(swing.diff)) swing = { i, diff };
  }
  if (swing && Math.abs(swing.diff) >= SWING_MIN) {
    const { i, diff } = swing;
    const s = slotName(target.slots[i]!);
    keys.push({
      kind: 'swing', weight: 10 + Math.min(Math.abs(diff), 8) / 4, number: r1(Math.abs(diff)), player: target.starters[i] ?? null,
      text: `${L.youPoss} ${s} vs ${L.themPoss} ${s} is the swing slot: projected ${signed1(Math.abs(diff))} for ${diff > 0 ? L.themObj : L.youObj}`,
    });
  }

  // empty slot
  const empty = target.slots.find((_, i) => !target.starters[i]);
  if (empty) {
    keys.push({
      kind: 'empty', weight: 9, number: 0, player: null,
      text: `${L.themPoss} ${slotName(empty)} slot is empty: it scores nothing unless they fill it`,
    });
  }

  // timing: whoever plays last knows what the other side scored
  const mineLast = lastKickoff(you), theirLast = lastKickoff(target);
  if (mineLast !== null && theirLast !== null && Math.abs(mineLast - theirLast) >= LATE_GAP_MS) {
    const theyAreLater = theirLast > mineLast;
    const late = theyAreLater ? target : you;
    const otherLast = theyAreLater ? mineLast : theirLast;
    const players = late.starters.filter(stillToCome).filter((p) => p.kickoff! >= otherLast + LATE_GAP_MS).sort((a, b) => b.projection - a.projection);
    if (players.length) {
      const when = windowName(players[0]!.kickoff!);
      const many = players.length > 1;
      keys.push({
        kind: 'timing', weight: 8, number: 0, player: players[0]!,
        text: theyAreLater
          ? `${L.themPoss} ${nameList(players)} ${many ? 'play' : 'plays'} ${when}, after ${L.youPoss} last starter: ${L.themKnow}`
          : `${L.youPoss} ${nameList(players)} ${many ? 'play' : 'plays'} ${when}, after all of ${L.themPoss} starters: ${L.youKnow}`,
      });
    }
  }

  // their star: the starter their week hinges on
  const star = hinges?.rows.find((r) => r.state !== 'final' && r.atStake >= STAKE_MIN);
  if (star) {
    const asPlayer = [...target.starters].find((p) => p?.pid === star.pid) ?? null;
    keys.push({
      kind: 'star', weight: 7 + Math.min(star.atStake, 20) / 10, number: Math.round(star.atStake), player: asPlayer,
      text: `${star.name} carries ${L.themPoss} week: ${Math.round(star.atStake)} points of win chance ride on him (${pts1(star.projection)} proj)`,
    });
  }

  // sloppy lineup
  if (!lineup.review && lineup.left >= LEFT_MIN) {
    keys.push({
      kind: 'lineup', weight: 6 + Math.min(lineup.left, 8) / 4, number: lineup.left, player: lineup.swaps[0]?.out ?? null,
      text: `${L.themPoss} lineup is ${pts1(lineup.left)} short of optimal: if it stays that way, that is your edge`,
    });
  }

  // an injured starter and what covers him
  const hurt = target.starters
    .filter((p): p is ScoutPlayer => !!p && !isLocked(p) && injuryClass(p.injury) !== null)
    .sort((a, b) => b.mu - a.mu)[0];
  if (hurt) {
    const cls = injuryClass(hurt.injury)!;
    const slot = target.slots[target.starters.indexOf(hurt)]!;
    const cover = target.bench
      .filter((b) => !isLocked(b) && injuryClass(b.injury) !== 'out' && fits(slot, b.pos))
      .sort((a, b) => b.projection - a.projection)[0];
    keys.push({
      kind: 'cover', weight: (cls === 'questionable' ? 5.5 : 6) + (cover ? 0 : 1.5), number: r1(hurt.projection), player: hurt,
      text: `${hurt.name} is ${cls} (${pts1(hurt.projection)} proj): ${cover
        ? `if he sits, ${cover.name} steps in at ${pts1(cover.projection)}`
        : `${L.themPoss} bench has no healthy ${hurt.pos.toLowerCase()} to cover him`}`,
    });
  }

  // habits across the season
  const vp = tendencies.vsProjection;
  if (vp && Math.abs(vp.avgDiff) >= PROJECTION_BAND) {
    keys.push({
      kind: 'habit', weight: 4 + Math.min(Math.abs(vp.avgDiff), 8) / 4, number: Math.abs(vp.avgDiff), player: null,
      text: vp.avgDiff > 0
        ? `they run ${pts1(vp.avgDiff)} above projection a week (${vp.weeks} ${plural(vp.weeks, 'week')}): do not trust the projection to hold them down`
        : `they run ${pts1(-vp.avgDiff)} below projection a week (${vp.weeks} ${plural(vp.weeks, 'week')}): their projection is likely too kind`,
    });
  } else if (tendencies.sideline && tendencies.sideline.avgLeft >= HABIT_LEFT) {
    keys.push({
      kind: 'habit', weight: 4, number: tendencies.sideline.avgLeft, player: null,
      text: `they leave ${pts1(tendencies.sideline.avgLeft)} points on the bench a week: expect another loose lineup`,
    });
  }

  return keys.sort((a, b) => b.weight - a.weight).slice(0, MAX_KEYS);
}

function stillOpen(p: ScoutPlayer): boolean {
  return p.state === 'pre' || p.state === 'live';
}
