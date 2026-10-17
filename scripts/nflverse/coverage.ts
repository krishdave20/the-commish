/* Routes, man/zone and coverage-shell splits from pbp_participation. Participation lists who was on the field for
   each play, but its `route` column names only the TARGETED receiver's route, so true routes run do not exist.
   A player's "routes" are therefore the dropbacks (pass attempts, sacks, scrambles) he was on the field for as a
   WR, TE or RB (position as listed for that play). See ROUTES_DEFINITION. */
import { isDropback, isTarget, type Participation, type Play } from './rows.ts';

export interface Split { routes: number; tgt: number; rec: number; yds: number; td: number }
const split = (): Split => ({ routes: 0, tgt: 0, rec: 0, yds: 0, td: 0 });

export interface CoveragePlayer {
  team: string;
  lastWeek: number;
  total: Split;
  man: Split;
  zone: Split;
  shells: Map<string, Split>;
}
export interface CoverageTeamAcc { man: number; zone: number; shells: Map<string, number> }

export interface CoverageAgg {
  players: Map<string, CoveragePlayer>;
  teams: Map<string, CoverageTeamAcc>;
  /** dropbacks seen / dropbacks that had a man or zone label */
  dropbacks: number;
  labeled: number;
}

/** WR, TE, RB and FB count as eligible receivers; everything else (QB, linemen) is treated as blocking. */
const ELIGIBLE = new Set(['WR', 'TE', 'RB', 'FB', 'HB']);

/** `plays` is every dropback of the participation season, keyed gameId|playId. */
export async function aggregateCoverage(plays: Map<string, Play>, parts: AsyncIterable<Participation>): Promise<CoverageAgg> {
  const players = new Map<string, CoveragePlayer>();
  const teams = new Map<string, CoverageTeamAcc>();
  let dropbacks = 0;
  let labeled = 0;
  for await (const part of parts) {
    const play = plays.get(`${part.gameId}|${part.playId}`);
    if (!play || !isDropback(play)) continue;
    dropbacks++;
    const eligible = new Set<string>();
    part.off.forEach((id, i) => { if (ELIGIBLE.has(part.pos[i])) eligible.add(id); });
    const target = isTarget(play) ? play.receiver : null;
    if (target) eligible.add(target);
    const mz = part.man;
    const shell = part.shell;
    if (mz !== null && play.opp) {
      labeled++;
      let t = teams.get(play.opp);
      if (!t) { t = { man: 0, zone: 0, shells: new Map() }; teams.set(play.opp, t); }
      if (mz) t.man++; else t.zone++;
      if (shell) t.shells.set(shell, (t.shells.get(shell) ?? 0) + 1);
    }
    for (const id of eligible) {
      let p = players.get(id);
      if (!p) { p = { team: play.team, lastWeek: 0, total: split(), man: split(), zone: split(), shells: new Map() }; players.set(id, p); }
      if (play.week >= p.lastWeek) { p.lastWeek = play.week; p.team = play.team; }
      let sh: Split | null = null;
      if (shell && mz !== null) {
        sh = p.shells.get(shell) ?? null;
        if (!sh) { sh = split(); p.shells.set(shell, sh); }
      }
      const targets = [p.total, mz === null ? null : mz ? p.man : p.zone, sh];
      const isT = id === target;
      for (const s of targets) {
        if (!s) continue;
        s.routes++;
        if (isT) {
          s.tgt++;
          if (play.complete) { s.rec++; s.yds += play.recYds; if (play.passTd) s.td++; }
        }
      }
    }
  }
  return { players, teams, dropbacks, labeled };
}
