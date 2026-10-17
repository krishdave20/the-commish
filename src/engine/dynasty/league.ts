/* The whole league's dynasty picture: every team's value, the picks it holds and its contender-or-rebuilder label. */
import type { TradedPick } from '../../data/contract.ts';
import type { Model } from '../types.ts';
import type { FcEntry } from '../draft/fantasycalc.ts';
import { classifyTeams, type LensInput, type LensTeam } from './lens.ts';
import {
  DEFAULT_PICK_ROUNDS, indexFcPicks, pickSeasons, projectedBuckets, valuePicks, type PickBucket, type PickValuation,
} from './picks.ts';
import { rosterAsset, teamDynastyValue, type PlayerFacts, type RosterAsset, type TeamValue } from './value.ts';

/** What the lens needs about a team's present: the model's records, simulation and expected points. */
export interface DynastyTeamNow {
  rid: number;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  expWins: number;
  playoffPct: number;
  /** expected lineup points, rest of the regular season */
  ptsRos: number;
}

/** Teams as the dynasty engine sees them, from the engine model. */
export function teamsNow(model: Model): DynastyTeamNow[] {
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  return model.teams.map((t) => {
    let ptsRos = 0;
    for (let w = cur; w <= last; w++) ptsRos += t.exp[w] ?? 0;
    return { rid: t.rid, wins: t.wins, losses: t.losses, ties: t.ties, pf: t.pf, expWins: t.expWins, playoffPct: t.playoffPct, ptsRos };
  });
}

export interface DynastyInput {
  teams: readonly DynastyTeamNow[];
  /** the simulation has not landed yet (odds and expected wins are placeholders) */
  oddsPending?: boolean;
  /** roster id → rostered Sleeper ids */
  rosters: Record<number, readonly string[]>;
  /** joined FantasyCalc rows (players and picks); null when FantasyCalc is down */
  fc: Record<string, FcEntry> | null;
  /** age and position facts from the players file */
  facts: (pid: string) => PlayerFacts | null;
  tradedPicks: readonly Pick<TradedPick, 'season' | 'round' | 'roster_id' | 'owner_id'>[];
  league: { season: string; status?: string; settings?: Record<string, unknown> | null };
  /** how many drafts ahead (default 3) */
  seasons?: number;
}

export interface DynastyLeague {
  /** the draft seasons covered, first is the next draft */
  seasons: string[];
  rounds: number;
  /** original owner → slot bucket for the next draft */
  buckets: Record<number, PickBucket>;
  picks: Record<number, PickValuation[]>;
  roster: Record<number, RosterAsset[]>;
  values: Record<number, TeamValue>;
  lens: LensTeam[];
  /** FantasyCalc listed no pick rows (picks have no value) */
  noPickValues: boolean;
}

/** The league's draft length: settings.draft_rounds, else FantasyCalc's four. */
export function leagueRounds(league: { settings?: Record<string, unknown> | null }): number {
  const r = league.settings?.draft_rounds;
  return typeof r === 'number' && r >= 1 ? Math.min(Math.floor(r), 10) : DEFAULT_PICK_ROUNDS;
}

export function buildDynasty(i: DynastyInput): DynastyLeague {
  const seasons = pickSeasons(i.league, i.seasons);
  const rounds = leagueRounds(i.league);
  const rosterIds = i.teams.map((t) => t.rid);
  const buckets = projectedBuckets(i.teams, i.oddsPending);
  const index = indexFcPicks(i.fc);
  const picks = valuePicks({ tradedPicks: i.tradedPicks, rosterIds, seasons, rounds, buckets, fc: index });
  const roster: Record<number, RosterAsset[]> = {};
  const values: Record<number, TeamValue> = {};
  const inputs: LensInput[] = [];
  for (const t of i.teams) {
    roster[t.rid] = (i.rosters[t.rid] ?? []).map((pid) => rosterAsset(pid, i.fc, i.facts(pid)));
    values[t.rid] = teamDynastyValue(t.rid, roster[t.rid], picks[t.rid] ?? []);
    inputs.push({ rid: t.rid, playoffPct: t.playoffPct, ptsRos: t.ptsRos, value: values[t.rid].total, youthShare: values[t.rid].youthShare });
  }
  return { seasons, rounds, buckets, picks, roster, values, lens: classifyTeams(inputs), noPickValues: !index };
}
