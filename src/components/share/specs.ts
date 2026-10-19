/* Where the app's own data becomes a card: one small function per card type, called at the place that has the numbers. Each returns plain data
   for src/engine/share; none of them touches the DOM. */
import type { Bracket, ResolvedMatch } from '../../engine';
import { bracketRows } from '../../engine/share';
import type {
  BracketCardData, CardPlayer, GradeCardData, GradePick, HuddleCardData, MatchupCardData, MatchupSide, TakeCardData,
} from '../../engine/share';
import type { MatchupLive, StarterLive, TeamLive } from '../../engine/live';
import { showLetter } from '../../engine/draft/grades.ts';
import type { DraftGrades, PickGrade, TeamGrade } from '../../engine/draft/grades.ts';
import type { Take } from '../../takes/types';
import { formatOdds, formatPoints1, signed } from '../../app/format';
import { TAKE_KIND_LABEL } from '../../app/names';
import { copyFor, roundLabel } from '../bracket/copy';

/* ---------- matchup ---------- */

const player = (p: StarterLive): CardPlayer => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.nfl });

function side(t: TeamLive, projected: boolean, decided: boolean): MatchupSide {
  const key = (p: StarterLive) => (projected ? p.projection : p.actual);
  const top = t.starters.slice().sort((a, b) => key(b) - key(a)).slice(0, 2);
  return {
    name: t.name,
    score: projected ? t.projection : t.actual,
    isMe: t.isMe,
    sub: decided ? '' : projected ? 'projected' : `projected ${formatPoints1(t.projection)} · ${t.live + t.yet === 0 ? 'all done' : `${t.live + t.yet} left`}`,
    performers: top.map((p) => ({ ...player(p), points: key(p) })),
  };
}

export interface MatchupCardInput {
  m: MatchupLive;
  week: number;
  /** nothing has been scored anywhere: the big numbers are projections */
  projected: boolean;
  /** the status chip of the game day page */
  status: { label: string; live: boolean; replay?: boolean };
}

export function matchupCard({ m, week, projected, status }: MatchupCardInput): MatchupCardData {
  const decided = m.final && !projected;
  const a = side(m.a, projected, decided), b = side(m.b, projected, decided);
  const margin = m.margin;
  const aName = m.a.name.toLowerCase(), bName = m.b.name.toLowerCase();
  const noPoints = m.a.actual === 0 && m.b.actual === 0;
  let headline: string;
  if (decided) headline = margin === 0 ? `${aName} and ${bName} tied` : `${margin > 0 ? aName : bName} beat ${margin > 0 ? bName : aName} by ${Math.abs(margin).toFixed(1)}`;
  else if (projected || noPoints) {
    const fav = m.winA >= 0.5;
    headline = `${fav ? aName : bName} is a ${formatOdds(fav ? m.winA : 1 - m.winA)} favourite over ${fav ? bName : aName}`;
  } else headline = Math.abs(margin) < 0.05 ? `${aName} and ${bName} are level` : `${margin > 0 ? aName : bName} leads ${margin > 0 ? bName : aName} by ${Math.abs(margin).toFixed(1)}`;
  const state: MatchupCardData['state'] = decided ? 'final' : status.live ? 'live' : 'pre';
  const statusLabel = decided ? 'final' : status.replay ? 'replay' : status.live ? 'live' : projected && /^kickoff/.test(status.label) ? status.label : projected ? 'projected' : 'between games';
  return {
    kind: 'matchup', week, statusLabel, state, a, b, winA: m.winA, preWinA: m.preWinA, projected, headline,
    footnote: decided ? '' : `${m.left} ${m.left === 1 ? 'starter' : 'starters'} left`,
  };
}

/* ---------- hot take ---------- */

const TONE_LABEL: Record<Take['tone'], string> = { good: 'good news', bad: 'risk', watch: 'watch' };

export function takeCard(take: Take): TakeCardData {
  return {
    kind: 'take', headline: take.headline, statLine: take.statLine, tone: take.tone, toneLabel: TONE_LABEL[take.tone], kindLabel: TAKE_KIND_LABEL[take.kind],
    week: take.week, player: { pid: take.pid, name: take.player, pos: take.pos, team: take.team }, trackRecord: take.trackRecord ?? null, dataLabel: take.dataLabel,
  };
}

/* ---------- bracket ---------- */

export interface BracketCardInput {
  bracket: Bracket;
  resolved: readonly ResolvedMatch[];
  names: ReadonlyMap<number, string>;
  meRid: number;
  /** the champion's roster id, null while undecided */
  champion: number | null;
  /** how many games the owner has picked (0 = the bracket as it stands) */
  picks: number;
}

/** "week 15", "weeks 15 to 17" over every week the bracket is played */
function span(weeks: readonly number[][]): string {
  const all = weeks.flat();
  if (all.length === 0) return '';
  const lo = Math.min(...all), hi = Math.max(...all);
  return lo === hi ? `week ${lo}` : `weeks ${lo} to ${hi}`;
}

export function bracketCard({ bracket, resolved, names, meRid, champion, picks }: BracketCardInput): BracketCardData {
  const copy = copyFor(bracket.kind);
  const rows = bracketRows(bracket);
  const nameOf = (rid: number | null) => (rid === null ? '' : names.get(rid) ?? `team ${rid}`);
  const slot = (s: { rid: number | null; seed: number | null }, bye: boolean, m: ResolvedMatch) => ({
    rid: s.rid, name: nameOf(s.rid), seed: s.seed, bye, advances: s.rid !== null && m.advancer === s.rid, isMe: s.rid === meRid,
  });
  return {
    kind: 'bracket', bracketKind: bracket.kind, title: copy.name, champLabel: copy.champ, champLine: copy.line, rounds: bracket.rounds,
    roundLabels: Array.from({ length: bracket.rounds }, (_, i) => roundLabel(i + 1, bracket.rounds)),
    matches: resolved.map((m) => ({ id: m.id, round: m.round, cy: rows.cy[m.id] ?? 0, a: slot(m.a, m.aBye, m), b: slot(m.b, m.bBye, m), locked: m.locked, feeds: rows.feeds[m.id] ?? null })),
    layoutHeight: rows.rows, champion: champion === null ? null : nameOf(champion), championIsMe: champion === meRid, picks, weekLabel: span(bracket.roundWeeks),
  };
}

/* ---------- draft grade ---------- */

const pickLine = (p: PickGrade) => `${p.pos.toLowerCase()} · pick ${p.pickNo}`;
const pickCard = (p: PickGrade): GradePick => ({
  pid: p.pid, name: p.name, pos: p.pos, team: p.nfl, line: pickLine(p), delta: `${signed(p.overExp, 0)} pts vs expected`,
});

export function gradeCard(grade: TeamGrade, team: string, isMe: boolean, grades: DraftGrades, season: string): GradeCardData {
  const miss = grade.worst && grade.worst.overExp < 0 ? grade.worst : null;
  return {
    kind: 'grade', team, isMe, draftDay: showLetter(grade.draftDay.letter), hindsight: showLetter(grade.hindsight.letter),
    rank: grade.hindsight.rank, teamCount: grades.teamCount, rankChange: grade.rankChange,
    best: grade.best ? pickCard(grade.best) : null, miss: miss ? pickCard(miss) : null, season: season ? `${season} season` : '',
  };
}

/* ---------- huddle ---------- */

export interface HuddleCardInput {
  sentence: string;
  odds: string | null;
  /** the live matchup of the signed-in team, when the live layer has it */
  mine: MatchupLive | null;
  week: number | null;
  sides: { a: CardPlayer[]; b: CardPlayer[] } | null;
}

export function huddleCard({ sentence, odds, mine, week, sides }: HuddleCardInput): HuddleCardData {
  const meIsA = mine ? mine.a.isMe : true;
  const winMe = mine ? (meIsA ? mine.winA : 1 - mine.winA) : null;
  const me = mine ? (meIsA ? mine.a : mine.b) : null;
  const opp = mine ? (meIsA ? mine.b : mine.a) : null;
  return {
    kind: 'huddle', sentence, odds, winMe, meName: me?.name ?? null, oppName: opp?.name ?? null,
    mine: sides?.a ?? [], theirs: sides?.b ?? [], weekLabel: week ? `week ${week}` : '',
  };
}
