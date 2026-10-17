/* Who gets which seed. Three ways to answer it (the playoff picture's toggle), all returning every team best-first:
   the first `playoffTeams` are the playoff seeds, the rest are the non-playoff field for the toilet bowl or consolation.

   Seeding rule (SPEC section 5, same as the season simulation): division winners first, then the wildcards by
   record, points for breaking ties. With no divisions the table is ranked by record. */
import type { BracketKind, BracketPicks } from './types.ts';

export interface SeedTeam { rid: number; wins: number; losses: number; ties: number; pf: number; divId: number }
export interface SeedRules { playoffTeams: number; divisions: number }

/** Record then points for, the sort key the season simulation uses (ties count as half a win). */
const keyOf = (t: Pick<SeedTeam, 'wins' | 'ties' | 'pf'>) => (t.wins + 0.5 * t.ties) * 10000 + t.pf;

/** All teams best-first: division winners (best first), then everyone else by record. */
export function rankTeams(teams: readonly SeedTeam[], rules: SeedRules): number[] {
  const byKey = [...teams].sort((a, b) => keyOf(b) - keyOf(a) || a.rid - b.rid);
  if (!rules.divisions) return byKey.map((t) => t.rid);
  const winners: SeedTeam[] = [];
  for (const d of new Set(teams.map((t) => t.divId))) {
    const best = byKey.find((t) => t.divId === d);
    if (best) winners.push(best);
  }
  winners.sort((a, b) => keyOf(b) - keyOf(a) || a.rid - b.rid);
  const w = new Set(winners.map((t) => t.rid));
  return [...winners.map((t) => t.rid), ...byKey.filter((t) => !w.has(t.rid)).map((t) => t.rid)];
}

/** "If it ended today": the current standings with the real tiebreaks. */
export const standingsOrder = (teams: readonly SeedTeam[], rules: SeedRules): number[] => rankTeams(teams, rules);

export interface ProjectedTeam { rid: number; /** chance of each seed 1..N */ seeds: readonly number[]; expW: number; pf: number }

/** "Projected": each team's most likely seed, taken greedily from the most likely pairing down, never giving two teams one seed.
    Seats nobody is likely to fill go to the teams with the best chance of making it. The field follows by expected wins. */
export function projectedOrder(teams: readonly ProjectedTeam[], playoffTeams: number): number[] {
  const n = Math.min(playoffTeams, teams.length);
  const cells: Array<{ rid: number; seed: number; p: number }> = [];
  for (const t of teams) t.seeds.slice(0, n).forEach((p, i) => { if (p > 0) cells.push({ rid: t.rid, seed: i, p }); });
  cells.sort((a, b) => b.p - a.p || a.seed - b.seed || a.rid - b.rid);
  const seat: Array<number | null> = new Array(n).fill(null);
  const placed = new Set<number>();
  for (const c of cells) {
    if (seat[c.seed] !== null || placed.has(c.rid)) continue;
    seat[c.seed] = c.rid; placed.add(c.rid);
  }
  const made = (t: ProjectedTeam) => t.seeds.slice(0, n).reduce((s, x) => s + x, 0);
  const rest = teams.filter((t) => !placed.has(t.rid)).sort((a, b) => made(b) - made(a) || b.expW - a.expW || b.pf - a.pf || a.rid - b.rid);
  let k = 0;
  for (let i = 0; i < n; i++) if (seat[i] === null) seat[i] = rest[k++]?.rid ?? null;
  const field = rest.slice(k).sort((a, b) => b.expW - a.expW || b.pf - a.pf || a.rid - b.rid);
  return [...(seat.filter((x) => x !== null) as number[]), ...field.map((t) => t.rid)];
}

export interface MachineGame { id: string; week: number; teamA: number; teamB: number }

/** "From the machine": the standings after your playoff-machine picks. Games you have not picked go to the team with
    the higher expected points that week, so the table is complete; points for adds every remaining game's expected points. */
export function machineOrder(
  teams: readonly SeedTeam[], games: readonly MachineGame[], picks: BracketPicks, means: Record<number, Record<number, number>>, rules: SeedRules,
): number[] {
  const t = new Map(teams.map((x) => [x.rid, { ...x } as { -readonly [K in keyof SeedTeam]: SeedTeam[K] }] as const));
  for (const g of games) {
    const a = t.get(g.teamA), b = t.get(g.teamB);
    if (!a || !b) continue;
    const ma = means[g.teamA]?.[g.week] ?? 0, mb = means[g.teamB]?.[g.week] ?? 0;
    a.pf += ma; b.pf += mb;
    const win = picks[g.id] ?? (ma >= mb ? g.teamA : g.teamB);
    if (win === g.teamA) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
  }
  return rankTeams([...t.values()], rules);
}

/** Seed lists for the two brackets from a best-first ranking: the playoff seeds, and the non-playoff field in the order its bracket seeds it
    (a toilet bowl seeds worst-first, a consolation bracket best-first). Fewer than two non-playoff teams means no field bracket. */
export function splitOrder(order: readonly number[], playoffTeams: number, field: Exclude<BracketKind, 'championship'>): { playoff: number[]; field: number[] } {
  const n = Math.min(playoffTeams, order.length);
  const rest = order.slice(n);
  const f = field === 'toilet' ? [...rest].reverse() : [...rest];
  return { playoff: order.slice(0, n), field: f.length >= 2 ? f : [] };
}
