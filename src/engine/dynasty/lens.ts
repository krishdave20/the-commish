/* Contender or rebuilder: put every team on two axes and name the quadrant.

   win-now strength  = 0.5 × percentile of playoff odds + 0.5 × percentile of expected points, rest of the regular season
   future strength   = 0.6 × percentile of dynasty value (players + picks) + 0.4 × percentile of youth share
                       (the share of player value that is 26 or younger)
   A percentile runs from 1 (best team in the league) to 0 (worst); ties share the better rank. A team whose youth share is
   unknown (no ages on file) takes the middle, 0.5, on that half of the future score.

   Both scores are relative to the league, so "strong" means at or above LENS_STRONG (the top half of the league: the 6th of
   12 clears it, the 7th does not).

                       weak future      strong future
        strong now     all-in           contender
        weak now       rebuilder        retool
*/
export const LENS_STRONG = 0.5;
export const NOW_WEIGHTS = { playoff: 0.5, points: 0.5 } as const;
export const FUTURE_WEIGHTS = { value: 0.6, youth: 0.4 } as const;

export type LensLabel = 'contender' | 'rebuilder' | 'retool' | 'all-in';

export const LENS_LABELS: readonly LensLabel[] = ['contender', 'all-in', 'retool', 'rebuilder'];

/** One line each, for the table's legend. */
export const LENS_BLURB: Record<LensLabel, string> = {
  contender: 'strong now and strong later',
  'all-in': 'strong now, thin later',
  retool: 'weak now, strong later',
  rebuilder: 'weak now and thin later',
};

export interface LensInput {
  rid: number;
  /** 0 to 1 */
  playoffPct: number;
  /** expected lineup points, rest of the regular season */
  ptsRos: number;
  /** dynasty value: players + picks */
  value: number;
  /** share of player value aged 26 and under; null when unknown */
  youthShare: number | null;
}

export interface LensTeam extends LensInput {
  label: LensLabel;
  nowScore: number;
  futureScore: number;
  strongNow: boolean;
  strongFuture: boolean;
  /** 1 = best, of `n` */
  playoffRank: number;
  ptsRank: number;
  valueRank: number;
  youthRank: number | null;
  n: number;
}

/** 1 + how many teams are strictly higher. */
function rankOf(x: number, all: readonly number[]): number {
  let r = 1;
  for (const y of all) if (y > x) r++;
  return r;
}

const percentile = (rank: number, n: number) => (n <= 1 ? 1 : (n - rank) / (n - 1));

export function labelFor(strongNow: boolean, strongFuture: boolean): LensLabel {
  return strongNow ? (strongFuture ? 'contender' : 'all-in') : (strongFuture ? 'retool' : 'rebuilder');
}

export function classifyTeams(inputs: readonly LensInput[]): LensTeam[] {
  const n = inputs.length;
  const playoffs = inputs.map((t) => t.playoffPct), points = inputs.map((t) => t.ptsRos), values = inputs.map((t) => t.value);
  const youths = inputs.map((t) => t.youthShare).filter((x): x is number => x !== null);
  return inputs.map((t) => {
    const playoffRank = rankOf(t.playoffPct, playoffs), ptsRank = rankOf(t.ptsRos, points), valueRank = rankOf(t.value, values);
    const youthRank = t.youthShare === null ? null : rankOf(t.youthShare, youths);
    const youthPct = youthRank === null ? 0.5 : percentile(youthRank, youths.length);
    const nowScore = NOW_WEIGHTS.playoff * percentile(playoffRank, n) + NOW_WEIGHTS.points * percentile(ptsRank, n);
    const futureScore = FUTURE_WEIGHTS.value * percentile(valueRank, n) + FUTURE_WEIGHTS.youth * youthPct;
    // a hair of tolerance so 0.5 computed from fractions still counts as exactly 0.5
    const strongNow = nowScore >= LENS_STRONG - 1e-9, strongFuture = futureScore >= LENS_STRONG - 1e-9;
    return { ...t, label: labelFor(strongNow, strongFuture), nowScore, futureScore, strongNow, strongFuture, playoffRank, ptsRank, valueRank, youthRank, n };
  });
}

const ord = (n: number) => {
  const v = n % 100;
  return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`;
};

/** The numbers behind a label, as a sentence: "playoff odds 71% (3rd of 12), ...". */
export function lensReason(t: LensTeam): string {
  const bits = [
    `playoff odds ${Math.round(t.playoffPct * 100)}% (${ord(t.playoffRank)} of ${t.n})`,
    `${Math.round(t.ptsRos).toLocaleString('en-US')} expected points rest of season (${ord(t.ptsRank)})`,
    `dynasty value ${Math.round(t.value).toLocaleString('en-US')} (${ord(t.valueRank)})`,
  ];
  if (t.youthShare !== null && t.youthRank !== null) bits.push(`${Math.round(t.youthShare * 100)}% of player value is 26 or younger (${ord(t.youthRank)})`);
  return `${bits.join('; ')}.`;
}
