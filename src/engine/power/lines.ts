/* One line per team, from real numbers, in the takes voice: short, numbers first, all lowercase, 20 words or fewer, no hype words.
   Every kind below is a candidate with a strength (0..100); the strongest wins (ties go to the earlier kind), so the line is about the
   team's biggest driver. Each kind has three wordings; which one a team gets is a hash of kind + roster id, so it is stable from run to run. */
import { bannedIn, hash, wordCount } from '../../takes/templates.ts';

export const MAX_LINE_WORDS = 20;
export { bannedIn, wordCount };

export interface LineFacts {
  rid: number;
  /** 1 = best */
  rank: number;
  teams: number;
  /** places gained since the previous rankings (+3 up, −1 down); null in the first week */
  movement: number | null;
  record: { w: number; l: number; t: number };
  /** rank of the record in the league (wins, then points for) */
  recordRank: number;
  allPlay: { w: number; l: number };
  allPlayRank: number;
  pfRank: number;
  pfpg: number;
  /** the league's points per team per game */
  leagueAvgPf: number;
  /** wins minus all-play expected wins */
  luck: number;
  streak: { dir: 'over' | 'under'; weeks: number } | null;
  lastPts: number | null;
  lastVsAvg: number | null;
  /** roster strength rank, current week only */
  rosRank: number | null;
  /** regular-season weeks still to play after the results counted */
  weeksLeft: number;
}

export type LineKind =
  | 'ap_leader' | 'ap_last' | 'luck_up' | 'luck_down' | 'cold' | 'hot' | 'paper_best' | 'paper_weak' | 'mover' | 'scorer' | 'cellar' | 'ap_gap' | 'steady';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (n: number) => NUMBER_WORDS[n] ?? String(n);
const d1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '0.0');
const signed1 = (x: number) => (x < 0 ? `-${d1(-x)}` : `+${d1(x)}`);
function ord(n: number): string {
  const r = n % 100;
  const s = r >= 11 && r <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}
const rec = (r: LineFacts['record']) => `${r.w}–${r.l}${r.t ? `–${r.t}` : ''}`;
const ap = (a: LineFacts['allPlay']) => `${a.w}–${a.l}`;
const spots = (n: number) => `${n} ${n === 1 ? 'spot' : 'spots'}`;
/** "; up 3 spots" / "; down 1 spot" / "" */
const moveTail = (m: number | null) => (m === null || m === 0 ? '' : m > 0 ? `; up ${spots(m)}` : `; down ${spots(-m)}`);
/** "climbing" / "sliding" / "" */
const trend = (m: number | null) => (m === null || m === 0 ? '' : m > 0 ? 'climbing' : 'sliding');
const semi = (s: string) => (s ? `; ${s}` : '');

interface Kind {
  kind: LineKind;
  /** null when the kind does not apply */
  strength: (f: LineFacts) => number | null;
  variants: Array<(f: LineFacts) => string>;
}

const KINDS: Kind[] = [
  {
    kind: 'ap_leader',
    strength: (f) => (f.allPlayRank === 1 ? 72 + (f.recordRank >= 3 ? 13 : 0) : null),
    variants: [
      (f) => `highest all-play mark in the league (${ap(f.allPlay)}), ${f.recordRank >= 3 ? 'record lags at' : 'record'} ${rec(f.record)}`,
      (f) => `best all-play record (${ap(f.allPlay)}); the ${rec(f.record)} record ${f.recordRank >= 3 ? 'undersells it' : 'backs it up'}`,
      (f) => `${ap(f.allPlay)} all-play, first in the league, and ${f.recordRank >= 3 ? `only ${ord(f.recordRank)} on record` : `${rec(f.record)} to match`}`,
    ],
  },
  {
    kind: 'ap_last',
    strength: (f) => (f.allPlayRank === f.teams ? 60 + (f.recordRank <= f.teams - 2 ? 10 : 0) : null),
    variants: [
      (f) => `lowest all-play mark in the league (${ap(f.allPlay)}), record ${rec(f.record)}`,
      (f) => `${ap(f.allPlay)} all-play, last in the league${moveTail(f.movement)}`,
      (f) => `last in all-play (${ap(f.allPlay)}) and ${ord(f.pfRank)} in points`,
    ],
  },
  {
    kind: 'luck_up',
    strength: (f) => (f.luck >= 1 ? Math.min(92, 45 + 15 * f.luck) : null),
    variants: [
      (f) => `luck ${signed1(f.luck)} wins; the next ${f.weeksLeft} weeks decide it`,
      (f) => `${rec(f.record)} record, ${ap(f.allPlay)} all-play: luck ${signed1(f.luck)} wins`,
      (f) => `winning more than the scoring says (${signed1(f.luck)} wins); ${ord(f.allPlayRank)} in all-play`,
    ],
  },
  {
    kind: 'luck_down',
    strength: (f) => (f.luck <= -1 ? Math.min(92, 45 + 15 * -f.luck) : null),
    variants: [
      (f) => `luck ${signed1(f.luck)} wins; ${ap(f.allPlay)} all-play says better than ${rec(f.record)}`,
      (f) => `${rec(f.record)} record, ${ap(f.allPlay)} all-play: luck ${signed1(f.luck)} wins${semi(trend(f.movement))}`,
      (f) => `unlucky by ${d1(-f.luck)} wins; ${ord(f.allPlayRank)} in all-play, ${ord(f.recordRank)} on record`,
    ],
  },
  {
    kind: 'cold',
    strength: (f) => (f.streak?.dir === 'under' && f.streak.weeks >= 3 ? 40 + 8 * f.streak.weeks : null),
    variants: [
      (f) => `${num(f.streak!.weeks)} straight weeks under the league average${moveTail(f.movement) || `; ${d1(f.pfpg)} a game`}`,
      (f) => `below the league average ${num(f.streak!.weeks)} weeks running, ${d1(f.pfpg)} points a game`,
      (f) => `${d1(f.pfpg)} points a game against a ${d1(f.leagueAvgPf)} average; ${num(f.streak!.weeks)} weeks under${moveTail(f.movement)}`,
    ],
  },
  {
    kind: 'hot',
    strength: (f) => (f.streak?.dir === 'over' && f.streak.weeks >= 3 ? 40 + 8 * f.streak.weeks : null),
    variants: [
      (f) => `${num(f.streak!.weeks)} straight weeks over the league average${moveTail(f.movement) || `; ${d1(f.pfpg)} a game`}`,
      (f) => `above the league average ${num(f.streak!.weeks)} weeks running, ${d1(f.pfpg)} points a game`,
      (f) => `${d1(f.pfpg)} points a game against a ${d1(f.leagueAvgPf)} average; ${num(f.streak!.weeks)} weeks over${moveTail(f.movement)}`,
    ],
  },
  {
    kind: 'paper_best',
    strength: (f) => (f.rosRank !== null && f.rosRank <= 3 && f.pfRank - f.rosRank >= 3 ? 55 + 4 * (f.pfRank - f.rosRank) : null),
    variants: [
      (f) => `${f.rosRank === 1 ? 'best' : `${ord(f.rosRank!)}-best`} roster on paper, ${ord(f.pfRank)} in points${semi(trend(f.movement))}`,
      (f) => `roster ranks ${ord(f.rosRank!)} for the rest of the season, points rank ${ord(f.pfRank)}${semi(trend(f.movement))}`,
      (f) => `${ord(f.rosRank!)} on paper, ${ord(f.pfRank)} on the scoreboard; ${f.weeksLeft} weeks to close the gap`,
    ],
  },
  {
    kind: 'paper_weak',
    strength: (f) => (f.rosRank !== null && f.rosRank >= f.teams - 2 && f.rosRank - f.pfRank >= 4 ? 55 + 4 * (f.rosRank - f.pfRank) : null),
    variants: [
      (f) => `${ord(f.pfRank)} in points, ${ord(f.rosRank!)} on paper for the rest of the season`,
      (f) => `scoring outruns the roster: ${ord(f.pfRank)} in points, ${ord(f.rosRank!)} going forward`,
      (f) => `points rank ${ord(f.pfRank)}, roster ranks ${ord(f.rosRank!)}${semi(trend(f.movement))}`,
    ],
  },
  {
    kind: 'mover',
    strength: (f) => (f.movement !== null && Math.abs(f.movement) >= 3 && f.lastPts !== null ? 45 + 6 * Math.abs(f.movement) : null),
    variants: [
      (f) => `${f.movement! > 0 ? 'up' : 'down'} ${spots(Math.abs(f.movement!))} after ${d1(f.lastPts!)}, ${d1(Math.abs(f.lastVsAvg ?? 0))} ${(f.lastVsAvg ?? 0) >= 0 ? 'over' : 'under'} the league average`,
      (f) => `${d1(f.lastPts!)} last week, ${d1(Math.abs(f.lastVsAvg ?? 0))} ${(f.lastVsAvg ?? 0) >= 0 ? 'above' : 'below'} the average; ${f.movement! > 0 ? 'up' : 'down'} ${spots(Math.abs(f.movement!))}`,
      (f) => `${f.movement! > 0 ? 'climbs' : 'drops'} ${spots(Math.abs(f.movement!))} to ${ord(f.rank)} on a ${d1(f.lastPts!)} week`,
    ],
  },
  {
    kind: 'scorer',
    strength: (f) => (f.pfRank === 1 ? 55 : null),
    variants: [
      (f) => `most points in the league, ${d1(f.pfpg)} a game, ${d1(f.pfpg - f.leagueAvgPf)} over the average`,
      (f) => `${d1(f.pfpg)} points a game, first in the league${moveTail(f.movement)}`,
      (f) => `top scorer at ${d1(f.pfpg)} a game; ${ord(f.allPlayRank)} in all-play (${ap(f.allPlay)})`,
    ],
  },
  {
    kind: 'cellar',
    strength: (f) => (f.pfRank === f.teams ? 55 : null),
    variants: [
      (f) => `fewest points in the league, ${d1(f.pfpg)} a game, ${d1(f.leagueAvgPf - f.pfpg)} under the average`,
      (f) => `${d1(f.pfpg)} points a game, last in the league${moveTail(f.movement)}`,
      (f) => `lowest scorer at ${d1(f.pfpg)} a game; ${ord(f.allPlayRank)} in all-play (${ap(f.allPlay)})`,
    ],
  },
  {
    kind: 'ap_gap',
    strength: (f) => (Math.abs(f.allPlayRank - f.recordRank) >= 3 ? 40 + 5 * Math.abs(f.allPlayRank - f.recordRank) : null),
    variants: [
      (f) => `all-play says ${ord(f.allPlayRank)} (${ap(f.allPlay)}), the record says ${ord(f.recordRank)} (${rec(f.record)})`,
      (f) => `${ord(f.allPlayRank)} in all-play, ${ord(f.recordRank)} on record (${rec(f.record)})${moveTail(f.movement)}`,
      (f) => `${rec(f.record)} on record, ${ap(f.allPlay)} all-play; ${ord(f.allPlayRank)} by the scoring`,
    ],
  },
  {
    kind: 'steady',
    strength: () => 10,
    variants: [
      (f) => `${ord(f.pfRank)} in points at ${d1(f.pfpg)} a game, ${ap(f.allPlay)} all-play${moveTail(f.movement)}`,
      (f) => `${rec(f.record)}, ${ord(f.allPlayRank)} in all-play (${ap(f.allPlay)})${moveTail(f.movement)}`,
      (f) => `${d1(f.pfpg)} points a game, ${ord(f.pfRank)} in the league; ${ap(f.allPlay)} all-play${moveTail(f.movement)}`,
    ],
  },
];

export interface PowerLine { kind: LineKind; text: string }

/** Every kind that applies, strongest first (tests walk this). */
export function lineCandidates(f: LineFacts): Array<{ kind: LineKind; strength: number; text: string }> {
  const out: Array<{ kind: LineKind; strength: number; text: string; order: number }> = [];
  KINDS.forEach((k, order) => {
    const s = k.strength(f);
    if (s === null) return;
    const v = k.variants[hash(`${k.kind}:${f.rid}`) % k.variants.length]!;
    out.push({ kind: k.kind, strength: s, text: v(f).replace(/\s+/g, ' ').trim(), order });
  });
  return out.sort((a, b) => b.strength - a.strength || a.order - b.order).map(({ kind, strength, text }) => ({ kind, strength, text }));
}

/** Every wording of every kind for these facts, applicable or not (tests check length and banned words on all of them). */
export function allVariants(f: LineFacts): string[] {
  return KINDS.flatMap((k) => k.variants.map((v) => v(f).replace(/\s+/g, ' ').trim()));
}

/** The line for a team: its strongest kind, worded by roster id. */
export function powerLine(f: LineFacts): PowerLine {
  const c = lineCandidates(f)[0]!;
  return { kind: c.kind, text: c.text };
}
