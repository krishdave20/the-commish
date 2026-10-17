/* Words for the takes: every headline and stat line is a template filled from the candidate's numbers (no LLM).
   Voice: a sharp fantasy content creator, quick and numbers-first. All lowercase except player names and team codes, which are data.
   Headlines are 12 words or fewer and avoid hype. Each detector has three headline variants; which one a player gets is
   chosen from a hash of kind + pid, so it is stable from run to run. */
import type { Candidate, Facts } from './common.ts';
import type { Relevance, TakeKind } from './types.ts';
import type { ModelPlayer } from '../engine/types.ts';

export const MAX_HEADLINE_WORDS = 12;

/** Words and marks a headline must never contain (whole-word match, case-insensitive; "!" anywhere). */
export const BANNED_WORDS = [
  'smash', 'league winner', 'league-winner', 'must', 'elite', 'insane', 'huge', 'massive', 'explode', 'explosion', 'monster', 'beast',
  'unstoppable', 'lock', 'guaranteed', 'boom', 'crush', 'fire', 'slam dunk', 'game-changer', 'game changer', 'wow', 'crazy', 'nuts', 'filthy', '!',
];

/** The banned words found in a headline (empty when it is clean). */
export function bannedIn(text: string): string[] {
  const t = text.toLowerCase();
  return BANNED_WORDS.filter((w) => (w === '!' ? t.includes('!') : new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, '[-\\s]')}($|[^a-z])`).test(t)));
}

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** FNV-1a: a small stable string hash. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** Which of `count` variants this kind + pid gets. Deterministic. */
export const variantIndex = (kind: TakeKind, pid: string, count = 3) => hash(`${kind}:${pid}`) % count;

/* ---------- formatting ---------- */

const fin = (x: number): number => {
  if (!Number.isFinite(x)) throw new Error(`non-finite number in template: ${x}`);
  return x;
};
const pc = (x: number) => String(Math.round(fin(x) * 100));
const d1 = (x: number) => fin(x).toFixed(1);
const d2 = (x: number) => fin(x).toFixed(2);
const int = (x: number) => Math.round(fin(x)).toLocaleString('en-US');
const signed = (x: number, f: (n: number) => string = int) => (x < 0 ? `-${f(-x)}` : `+${f(x)}`);
/** Team codes are data like player names: they stay as Sleeper writes them ("WAS" must not read as a verb). */
const tm = (s: string) => s;
const poss = (n: string) => (n.endsWith('s') ? `${n}'` : `${n}'s`);
function ord(n: number): string {
  const k = Math.round(fin(n));
  const r = k % 100;
  const suffix = r >= 11 && r <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[k % 10] ?? 'th';
  return `${k}${suffix}`;
}
const weeksText = (a: number, b: number) => (a === b ? `week ${a}` : `weeks ${a}–${b}`);
function weekList(ws: number[]): string {
  const contiguous = ws.every((w, i) => i === 0 || w === ws[i - 1]! + 1);
  return contiguous && ws.length > 1 ? `weeks ${ws[0]}–${ws[ws.length - 1]}` : `week${ws.length > 1 ? 's' : ''} ${ws.join(', ')}`;
}
const tag = (c: Candidate) => `(${int(c.sample.n)} ${c.sample.label})`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

type F<K extends TakeKind> = Extract<Facts, { kind: K }>;
interface Template<K extends TakeKind> {
  headlines: Array<(f: F<K>, name: string, c: Candidate) => string>;
  stat: (f: F<K>, c: Candidate) => string;
}

const T: { [K in TakeKind]: Template<K> } = {
  usage_spike: {
    headlines: [
      (f, n) => `+${Number(pc(f.now)) - Number(pc(f.base))} points of snap share for ${n}`,
      (f, n) => `${n} is on the field more: ${pc(f.now)}% of snaps`,
      (f, n) => `${poss(n)} snap share jumped to ${pc(f.now)}%`,
    ],
    stat: (f, c) => `snap share ${pc(f.now)}% in week ${f.week}, up from ${pc(f.base)}% over ${weeksText(f.baseFrom, f.baseTo)} ${tag(c)}`,
  },
  target_hog: {
    headlines: [
      (f, n) => `${n} is getting ${pc(f.share)}% of the targets`,
      (f, n) => `${pc(f.share)}% of the targets go to ${n}`,
      (f, n) => `${n} owns a ${pc(f.share)}% target share`,
    ],
    stat: (f, c) =>
      `target share ${pc(f.share)}% over ${weeksText(f.from, f.to)} (${int(f.tgt)} of ${int(f.teamPass)} team pass attempts)` +
      (f.seasonShare != null ? `, ${pc(f.seasonShare)}% for the season ${tag(c)}` : ` ${tag(c)}`),
  },
  buy_low: {
    headlines: [
      (_f, n) => `${n} has the air yards, not the points yet`,
      (_f, n) => `buy low: ${poss(n)} air yards beat his points`,
      (f, n) => `${n}: ${ord(f.ayRank)} in air yards share, ${ord(f.ppgRank)} in ppg`,
    ],
    stat: (f, c) =>
      `air-yards share ${pc(f.ayShare)}% (${ord(f.ayRank)} among ${c.pos.toLowerCase()}s) but ${d1(f.ppg)} points per game (${ord(f.ppgRank)} of ${f.pool}) ${tag(c)}`,
  },
  sell_high: {
    headlines: [
      (f, n) => `${n} has ${f.tds} tds on ${d1(f.xtd)} expected`,
      (_f, n) => `sell-high watch: ${poss(n)} touchdowns are running hot`,
      (f, n) => `${n} is scoring ${d1(f.gap)} more tds than usage says`,
    ],
    stat: (f, c) => `${f.tds} touchdowns on ${d1(f.xtd)} expected (${signed(f.gap, d1)}) from ${int(f.opps)} targets and carries over ${f.games} games ${tag(c)}`,
  },
  rz_role_change: {
    headlines: [
      (f, n) => (f.up ? `${n} now gets ${pc(f.now)}% of inside-10 plays` : `${poss(n)} inside-10 share fell to ${pc(f.now)}%`),
      (f, n) => `${poss(n)} share of inside-10 plays: ${pc(f.prior)}% to ${pc(f.now)}%`,
      (f, n) => (f.up ? `${n} is seeing more goal-line work` : `${n} is losing goal-line work`),
    ],
    stat: (f, c) =>
      `inside-10 share ${pc(f.now)}% over ${weeksText(f.from, f.to)} (${f.touchesNow} touches), ${f.up ? 'up' : 'down'} from ${pc(f.prior)}% in his earlier games (${f.touchesPrior} touches) ${tag(c)}`,
  },
  box_count_edge: {
    headlines: [
      (f, n) => `${n} averages ${d1(f.ypcLight)} ypc against light boxes`,
      (f, n) => `${tm(f.opp)} plays light boxes; ${n} runs well against them`,
      (f, n) => `light-box matchup for ${n} against ${tm(f.opp)}`,
    ],
    stat: (f, c) =>
      `${d1(f.ypcLight)} yards per carry into light boxes${f.ypc != null ? `, ${d1(f.ypc)} overall` : ''}; ${tm(f.opp)} faced light boxes on ${pc(f.oppRate)}% of ${int(f.oppCarries)} charted rushes ${tag(c)}`,
  },
  blitz_beater: {
    headlines: [
      (f, n) => `${n} beats the blitz and ${tm(f.opp)} blitzes a lot`,
      (f, n) => `${n} averages ${d1(f.yptBlitz)} yards a target vs the blitz`,
      (f, n) => `${tm(f.opp)} blitzes ${pc(f.oppRate)}%, and ${n} eats against it`,
    ],
    stat: (f, c) =>
      `${d1(f.yptBlitz)} yards per target against the blitz, ${d1(f.yptNo)} without it (${f.nblTgt} targets); ${tm(f.opp)} blitzes ${pc(f.oppRate)}% of ${int(f.oppDropbacks)} charted dropbacks ${tag(c)}`,
  },
  soft_schedule: {
    headlines: [
      (f, n) => `${f.opps.length} soft matchups in a row for ${n}`,
      (f, n) => (f.opps.length <= 3 ? `${n} faces ${list(f.opps.map(tm))}: all soft` : `${f.opps.length} soft matchups ahead for ${n}`),
      (_f, n) => `soft schedule ahead for ${n}`,
    ],
    stat: (f, c) =>
      `matchup grades ${f.grades.map(d2).join(', ')} against ${f.opps.map(tm).join(', ')} in ${weekList(f.weeks)} (1.00 is average, ${d2(f.dvpSoftMin)} and up is soft) ${tag(c)}`,
  },
  waiver_riser: {
    headlines: [
      (_f, n) => `${n} is being added fast and playing more`,
      (f, n) => `${int(f.adds)} adds and a bigger role for ${n}`,
      (_f, n) => `waiver watch: ${poss(n)} usage is rising`,
    ],
    stat: (f, c) =>
      `${int(f.adds)} trending adds; ${f.measure} ${pc(f.now)}% in week ${f.week}, up from ${pc(f.base)}% over ${weeksText(f.from, f.to)} ${tag(c)}`,
  },
  dynasty_mover: {
    headlines: [
      (f, n) => `${poss(n)} dynasty value ${f.up ? 'rose' : 'fell'} ${int(Math.abs(f.trend))} in 30 days`,
      (f, n) => `${n} is ${f.up ? 'climbing' : 'sliding'} on fantasycalc: ${signed(f.trend)} in 30 days`,
      (f, n) => `dynasty ${f.up ? 'riser' : 'faller'}: ${n} ${signed(f.trend)} over 30 days`,
    ],
    stat: (f, c) =>
      `fantasycalc value ${int(f.value)}, ${signed(f.trend)}${f.pct != null ? ` (${signed(Math.round(f.pct * 100), String)}%)` : ''} over 30 days; ${f.up ? 'top' : 'bottom'} ${Math.round(f.tailPct * 100)}% of movers ${tag(c)}`,
  },
  coverage_note: {
    headlines: [
      (f, n) => (f.match ? `${n} thrives against ${f.better}; ${tm(f.opp)} plays ${f.better} ${pc(f.oppRate)}%` : `${n} is worse against ${f.oppCoverage}; ${tm(f.opp)} plays it ${pc(f.oppRate)}%`),
      (f, n) => (f.match ? `${n} prefers ${f.better} and ${tm(f.opp)} plays it ${pc(f.oppRate)}%` : `${n} struggles against ${f.oppCoverage}; ${tm(f.opp)} plays it ${pc(f.oppRate)}%`),
      (f, n, c) => `${c.dataLabel ? 'last season' : 'this season'}: ${n} was ${f.match ? 'better' : 'worse'} against ${f.oppCoverage}`,
    ],
    stat: (f, c) => {
      const other = f.better === 'man' ? 'zone' : 'man';
      const [yb, yo, rb, ro] = f.better === 'man' ? [f.yprrMan, f.yprrZone, f.manRoutes, f.zoneRoutes] : [f.yprrZone, f.yprrMan, f.zoneRoutes, f.manRoutes];
      const when = c.dataLabel ? `${c.dataLabel}: ` : '';
      return `${when}${d2(yb)} yards per route against ${f.better} (${rb} routes) vs ${d2(yo)} against ${other} (${ro} routes); ${tm(f.opp)} played ${f.oppCoverage} on ${pc(f.oppRate)}% of dropbacks (route estimate)`; // the route counts are in the line, so no trailing sample tag; Take.sample still carries the smaller split
    },
  },
};

/** Every headline variant for a candidate (tests walk these to check length and banned words). */
export function headlineVariants(c: Candidate): string[] {
  const t = T[c.kind] as unknown as Template<TakeKind>;
  return t.headlines.map((h) => h(c.facts as never, c.player, c));
}

/** The headline and stat line for a candidate. Throws on a non-finite number, so a bad candidate can be dropped. */
export function renderCandidate(c: Candidate): { headline: string; statLine: string } {
  const t = T[c.kind] as unknown as Template<TakeKind>;
  const headline = t.headlines[variantIndex(c.kind, c.pid, t.headlines.length)]!(c.facts as never, c.player, c);
  return { headline: headline.replace(/\s+/g, ' ').trim(), statLine: t.stat(c.facts as never, c).replace(/\s+/g, ' ').trim() };
}

/* ---------- why it matters for you ---------- */

const FLEX = new Set(['FLEX', 'REC_FLEX', 'WRRB_FLEX', 'IDP_FLEX']);

/** Where a player sits in the signed-in team's lineup this week: a starting slot code, 'IR', or 'BN'. */
export function lineupSpot(model: { meRid: number; teams: Array<{ rid: number; starters: string[] }>; meta: { slots: string[] } }, p: ModelPlayer): string {
  if (p.onIr) return 'IR';
  const me = model.teams.find((t) => t.rid === model.meRid);
  const i = me ? me.starters.indexOf(p.pid) : -1;
  return i >= 0 ? (model.meta.slots[i] ?? 'BN') : 'BN';
}

export interface WhyContext {
  /** the signed-in team's slot for him (see lineupSpot) */
  spot: string;
  /** lineup points gained for the rest of season by adding him (waiver board), or undefined when not computed */
  waiverGain: number | undefined;
  /** whether the waiver board was computed at all */
  waiverKnown: boolean;
  /** team name of the roster that owns him */
  ownerTeam: string;
}

/** The "why it matters for you" line, by relevance. League-wide takes have none. */
export function whyForYouLine(relevance: Relevance, w: WhyContext): string | null {
  if (relevance === 'mine') {
    if (w.spot === 'IR') return "he's on your ir";
    if (w.spot === 'BN') return "he's on your bench";
    if (FLEX.has(w.spot)) return "he's in your flex this week";
    if (w.spot === 'SUPER_FLEX') return "he's in your superflex this week";
    return `he's starting for you at ${w.spot.toLowerCase()} this week`;
  }
  if (relevance === 'waiver') {
    if (!w.waiverKnown) return 'free agent';
    return w.waiverGain != null && w.waiverGain > 0 ? `free agent; lineup lift +${d1(w.waiverGain)} for the rest of season` : 'free agent; no lineup lift for your team right now';
  }
  if (relevance === 'trade_target') return `on ${w.ownerTeam}'s roster`;
  return null;
}
