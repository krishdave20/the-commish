/* Build the two sides of a matchup for `hingesOf`, from either source:
   - the live feed (`MatchupLive`): actual points, the game clock and the live projection, so points already scored stay;
   - the model, before any game has a feed: the week's expectations, with the what-if scenario applied to my team. */
import { createScope, emptyScenario } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';
import { gameStatusText } from '../live/scores.ts';
import type { MatchupLive, StarterLive, TeamLive } from '../live/derive.ts';
import type { Model, ModelPlayer } from '../types.ts';
import type { HingeSide, HingeStarter } from './hinges.ts';

function fromStarterLive(p: StarterLive): HingeStarter {
  const g = p.game;
  const known = !!g && g.id !== 'guess';
  const opp = known && p.nfl ? (g!.home === p.nfl ? g!.away : g!.home) : null;
  return {
    slot: p.slot, pid: p.pid, name: p.name, pos: p.pos, nfl: p.nfl, state: p.state, actual: p.actual, mu: p.mu, remaining: p.remaining,
    opp: opp || null, home: known && p.nfl ? g!.home === p.nfl : null,
    statusText: g && p.state !== 'pre' ? gameStatusText(g) : '', kickoff: g?.kickoff ?? null, assumed: p.assumed,
  };
}

export function sideFromLive(t: TeamLive): HingeSide {
  return { rid: t.rid, name: t.name, isMe: t.isMe, actual: t.actual, starters: t.starters.map(fromStarterLive) };
}

/** My side and the opponent's from one live matchup (the app puts the signed-in team first, but do not rely on it). */
export function sidesFromLive(m: MatchupLive): { mine: HingeSide; theirs: HingeSide } {
  const a = sideFromLive(m.a), b = sideFromLive(m.b);
  return b.isMe && !a.isMe ? { mine: b, theirs: a } : { mine: a, theirs: b };
}

/* ---------- from the model ---------- */

function fromModelPlayer(model: Model, slot: string, p: ModelPlayer, mu: number): HingeStarter {
  const week = model.meta.currentWeek;
  const opp = p.opp[week];
  const hasGame = !!opp && opp !== 'BYE';
  // the model's number for a player who has played is his actual score, and a finished game is the only thing it can tell us
  const played = p.playedThisWeek;
  return {
    slot, pid: p.pid, name: p.name, pos: p.pos, nfl: p.nfl,
    state: !hasGame ? 'idle' : played ? 'final' : 'pre',
    actual: played ? mu : 0, mu, remaining: played || !hasGame ? 0 : 1,
    opp: hasGame ? opp! : null, home: null, statusText: played ? 'played' : '', kickoff: null,
  };
}

/** The opponent of `rid` in the current week, from the schedule rows or the game list; null when none. */
export function opponentOf(model: Model, rid: number, week: number = model.meta.currentWeek): number | null {
  const row = model.history.find((h) => h.week === week && h.rid === rid);
  if (row) return row.opp;
  const game = model.games.find((g) => g.week === week && (g.teamA === rid || g.teamB === rid));
  return game ? (game.teamA === rid ? game.teamB : game.teamA) : null;
}

/** Both sides from the model alone (week = the current week). My team's lineup is the engine's best lineup with the scenario applied;
    the opponent's is the lineup he set in Sleeper (his best lineup when none is set). Null when there is no opponent this week. */
export function sidesFromModel(model: Model, scenario: Scenario = emptyScenario(), meRid: number = model.meRid): { mine: HingeSide; theirs: HingeSide } | null {
  const week = model.meta.currentWeek;
  const oppRid = opponentOf(model, meRid, week);
  const meTeam = model.teams.find((t) => t.rid === meRid), oppTeam = model.teams.find((t) => t.rid === oppRid);
  if (!meTeam || !oppTeam) return null;
  const sc = createScope(model, scenario, meRid);
  const L = sc.lineup(sc.myRoster(), week, true);
  const mineStarters: HingeStarter[] = [];
  for (const s of L.slots) if (s.p) mineStarters.push(fromModelPlayer(model, s.slot, s.p, sc.val(s.p, week, true)));
  const theirStarters: HingeStarter[] = [];
  oppTeam.starters.forEach((pid, i) => {
    const p = pid && pid !== '0' ? sc.idx.P[pid] : undefined;
    if (p) theirStarters.push(fromModelPlayer(model, model.meta.slots[i] ?? p.pos, p, p.mu[week] ?? 0));
  });
  // no lineup set in Sleeper yet (or none the model knows): use his best lineup by the week's expectations
  if (theirStarters.length === 0) {
    const L2 = sc.lineup(sc.otherRoster(oppTeam.rid, week), week, false);
    for (const s of L2.slots) if (s.p) theirStarters.push(fromModelPlayer(model, s.slot, s.p, s.p.mu[week] ?? 0));
  }
  const actualOf = (xs: HingeStarter[]) => xs.reduce((s, p) => s + p.actual, 0);
  return {
    mine: { rid: meTeam.rid, name: meTeam.team, isMe: true, actual: actualOf(mineStarters), starters: mineStarters },
    theirs: { rid: oppTeam.rid, name: oppTeam.team, isMe: false, actual: actualOf(theirStarters), starters: theirStarters },
  };
}
