// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { designations, nonWinnersAbove, standingsLocked, winsToClinch, type ClinchLeague, type Mark, type Picks } from './clinch.ts';

const team = (rid: number, wins: number, divId = rid) => ({ rid, wins, losses: 0, divId });
const g = (id: string, a: number, b: number) => ({ id, teamA: a, teamB: b });
const marks = (L: ClinchLeague, picks?: Picks) => Object.fromEntries(Object.entries(designations(L, picks)).map(([r, d]) => [r, d.mark])) as Record<string, Mark>;

describe('standingsLocked', () => {
  it('applies picks to wins and losses and counts the games still open', () => {
    const L: ClinchLeague = { teams: [team(1, 2), team(2, 1), team(3, 0)], games: [g('a', 1, 2), g('b', 2, 3), g('c', 1, 3)], divisions: 0, playoffTeams: 1 };
    const r = standingsLocked(L, { a: 2, b: 2 });
    expect(r.W).toEqual({ 1: 2, 2: 3, 3: 0 });
    expect(r.L).toEqual({ 1: 1, 2: 0, 3: 1 });
    expect(r.open).toEqual({ 1: 1, 2: 0, 3: 1 });
  });
});

describe('clinch marks: zero divisions (record only)', () => {
  // 4 teams, top 2 make it. A and B are far ahead; C and D can still only play each other.
  const L: ClinchLeague = {
    teams: [team(1, 5), team(2, 4), team(3, 0), team(4, 0)], games: [g('x', 3, 4), g('y', 3, 4)], divisions: 0, playoffTeams: 2,
  };
  it('marks the leaders x (clinched) and the others e (eliminated)', () => {
    expect(marks(L)).toEqual({ 1: 'x', 2: 'x', 3: 'e', 4: 'e' });
  });
  it('a team is not marked while a catch-up is still possible', () => {
    const open: ClinchLeague = { ...L, games: [g('x', 1, 2), g('y', 3, 4), g('z', 3, 4)] };
    // team 2 (4 wins) can still reach 5 and tie team 1's 5; with teams 3/4 maxing at 2, both are still safe
    expect(marks(open)).toEqual({ 1: 'x', 2: 'x', 3: 'e', 4: 'e' });
    const tight: ClinchLeague = { teams: [team(1, 3), team(2, 3), team(3, 3)], games: [g('a', 1, 2), g('b', 2, 3), g('c', 1, 3)], divisions: 0, playoffTeams: 2 };
    expect(marks(tight)).toEqual({ 1: '', 2: '', 3: '' });
  });
  it('winsToClinch reports how many of the open games must be won', () => {
    const lg: ClinchLeague = { teams: [team(1, 4), team(2, 3), team(3, 3), team(4, 0)], games: [g('a', 1, 4), g('b', 2, 3), g('c', 1, 4)], divisions: 0, playoffTeams: 2 };
    // team 1: 4 wins, 2 games left. Teams 2 and 3 can each reach 4 (the strict math does not use the fact that they
    // play each other), which is 2 threats for 1 spare spot. After one more win (5 wins) neither can reach it.
    const w = winsToClinch(lg, 1);
    expect(w.open).toBe(2);
    expect(w.spot).toBe(1);
    expect(w.winOut).toBe(false);
  });
});

describe('clinch marks: with divisions', () => {
  it('y: clinched the division, and x for the teams that cannot be caught for a wildcard', () => {
    // div1 {1,2}, div2 {3,4}; 3 playoff teams = 2 division winners + 1 wildcard
    const L: ClinchLeague = {
      teams: [team(1, 6, 1), team(2, 2, 1), team(3, 3, 2), team(4, 3, 2)], games: [g('a', 3, 4)], divisions: 2, playoffTeams: 3,
    };
    const m = marks(L);
    expect(m[1]).toBe('y');
    expect(m[2]).toBe('e'); // out of the division race and 2 non-winners (3 and 4) are surely above it for 1 wildcard spot
    expect(m[3]).toBe('x');
    expect(m[4]).toBe('x');
  });
  it('d: out of the division race but still alive for a wildcard', () => {
    const L: ClinchLeague = {
      teams: [team(1, 5, 1), team(2, 2, 1), team(3, 3, 2), team(4, 3, 2)],
      games: [g('a', 2, 3), g('b', 2, 4)], divisions: 2, playoffTeams: 3,
    };
    const m = marks(L);
    expect(m[2]).toBe('d'); // team 1's 5 wins beat team 2's best (4)
    expect(m[1]).toBe('y');
  });
  it('a division winner never takes a wildcard spot', () => {
    // div1 {1,2,3} all above the bubble team 4 in div2; only one of them can be the winner,
    // so at most 2 of the 3 take wildcard spots. With 2 wildcards, team 4 is not eliminated.
    const L: ClinchLeague = {
      teams: [team(1, 8, 1), team(2, 8, 1), team(3, 8, 1), team(4, 2, 2), team(5, 0, 2)], games: [], divisions: 2, playoffTeams: 4,
    };
    // wildcards = 4 - 2 = 2; the 3 div-1 teams contribute n-1 = 2 non-winners above team 4 → exactly fills the wildcards
    expect(marks(L)[4]).toBe('y'); // team 4 wins division 2 outright (2 > 0), so it is in regardless
    const L2: ClinchLeague = { ...L, teams: [team(1, 8, 1), team(2, 8, 1), team(3, 8, 1), team(4, 2, 2), team(5, 3, 2)] };
    // now team 4 is behind team 5 in its division: out of the division race; 2 non-winners above (n-1 from div 1) = nWild → eliminated
    expect(marks(L2)[4]).toBe('e');
    // and with 3 playoff slots there is one fewer wildcard...
    expect(marks({ ...L2, playoffTeams: 3 })[4]).toBe('e');
    // ...while with 5 playoff slots (3 wildcards) team 4 is still alive
    expect(marks({ ...L2, playoffTeams: 5 })[4]).not.toBe('e');
  });
  it('nonWinnersAbove counts n-1 per division', () => {
    const L: ClinchLeague = { teams: [team(1, 5, 1), team(2, 5, 1), team(3, 5, 1), team(4, 1, 2)], games: [], divisions: 2, playoffTeams: 3 };
    const { W, open } = standingsLocked(L);
    expect(nonWinnersAbove(L, L.teams[3]!, W, open, 1, 'sure')).toEqual({ total: 2, ownAbove: 0 });
  });
});

describe('winsToClinch: win-out', () => {
  it('detects a clinch that only happens by winning every remaining game', () => {
    // two 4-win teams, one spot, and they still play each other
    const L: ClinchLeague = { teams: [team(1, 4), team(2, 4)], games: [g('h2h', 1, 2)], divisions: 0, playoffTeams: 1 };
    const w = winsToClinch(L, 1);
    expect(w).toEqual({ spot: 1, div: null, open: 1, winOut: true });
    expect(marks(L)).toEqual({ 1: '', 2: '' });
    expect(marks(L, { h2h: 1 })).toEqual({ 1: 'x', 2: 'e' });
  });
  it('is not a win-out when fewer wins already clinch', () => {
    const L: ClinchLeague = { teams: [team(1, 6), team(2, 1), team(3, 1)], games: [g('a', 1, 2), g('b', 1, 3), g('c', 2, 3)], divisions: 0, playoffTeams: 1 };
    const w = winsToClinch(L, 1);
    expect(w.spot).toBe(0);
    expect(w.winOut).toBe(false);
  });
  it('reports the division count separately, and null when it cannot be done alone', () => {
    const L: ClinchLeague = {
      teams: [team(1, 3, 1), team(2, 3, 1), team(3, 0, 2), team(4, 0, 2)], games: [g('a', 1, 2), g('b', 3, 4)], divisions: 2, playoffTeams: 3,
    };
    const w = winsToClinch(L, 1);
    expect(w.div).toBeNull(); // team 2 can always match 3 wins... unless team 1 wins out
    expect(w.open).toBe(1);
    expect(w.spot).toBe(0); // a wildcard spot is already safe: only 1 non-winner could be above team 1
  });
  it('returns an empty result for an unknown team', () => {
    expect(winsToClinch({ teams: [team(1, 1)], games: [], divisions: 0, playoffTeams: 1 }, 99)).toEqual({ spot: null, div: null, open: 0, winOut: false });
  });
});

/* ---------- property test: marks are never wrong ---------- */

/** Deterministic PRNG for reproducible random leagues. */
function rng(seed: number) {
  let a = seed;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) | 0; return ((a >>> 0) % 100000) / 100000; };
}
const permutations = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

interface Facts { alwaysMakes: boolean[]; alwaysDiv: boolean[]; neverMakes: boolean[]; neverDiv: boolean[] }

/** Enumerate every outcome of the unpicked games and every total tiebreak order; record what is guaranteed or impossible. */
function oracle(L: ClinchLeague, picks: Picks, filter?: (outcome: Record<string, number>) => boolean): Facts {
  const K = L.teams.length;
  const free = L.games.filter((x) => picks[x.id] == null);
  const perms = permutations(L.teams.map((_, i) => i));
  const f: Facts = { alwaysMakes: Array(K).fill(true), alwaysDiv: Array(K).fill(true), neverMakes: Array(K).fill(true), neverDiv: Array(K).fill(true) };
  const divs = L.divisions ? [...new Set(L.teams.map((t) => t.divId))] : [];
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const W = L.teams.map((t) => t.wins);
    const idx = (rid: number) => L.teams.findIndex((t) => t.rid === rid);
    const outcome: Record<string, number> = {};
    for (const x of L.games) {
      const w = picks[x.id] != null ? picks[x.id]! : (mask >> free.indexOf(x)) & 1 ? x.teamB : x.teamA;
      outcome[x.id] = w;
      W[idx(w)] = W[idx(w)]! + 1;
    }
    if (filter && !filter(outcome)) continue;
    for (const perm of perms) {
      const key = W.map((w, i) => w * 100 + (K - perm.indexOf(i)));
      const winners = divs.map((d) => L.teams.map((_, i) => i).filter((i) => L.teams[i]!.divId === d).sort((a, b) => key[b]! - key[a]!)[0]!);
      winners.sort((a, b) => key[b]! - key[a]!);
      const rest = L.teams.map((_, i) => i).filter((i) => !winners.includes(i)).sort((a, b) => key[b]! - key[a]!);
      const made = new Set(winners.concat(rest.slice(0, Math.max(0, L.playoffTeams - winners.length))).slice(0, L.playoffTeams));
      for (let i = 0; i < K; i++) {
        const m = made.has(i), d = winners.includes(i);
        if (!m) f.alwaysMakes[i] = false; else f.neverMakes[i] = false;
        if (!d) f.alwaysDiv[i] = false; else f.neverDiv[i] = false;
      }
    }
  }
  return f;
}

function randomLeague(r: () => number): { L: ClinchLeague; picks: Picks } {
  const K = 4 + Math.floor(r() * 2); // 4 or 5 teams
  const nDiv = r() < 0.3 ? 0 : 1 + Math.floor(r() * 2); // 0, 1 or 2 divisions
  const teams = Array.from({ length: K }, (_, i) => ({ rid: i + 1, wins: Math.floor(r() * 5), losses: 0, divId: nDiv ? 1 + (i % nDiv) : i + 1 }));
  const nGames = 1 + Math.floor(r() * 8);
  const games = Array.from({ length: nGames }, (_, i) => {
    const a = Math.floor(r() * K);
    let b = Math.floor(r() * (K - 1));
    if (b >= a) b++;
    return g('g' + i, a + 1, b + 1);
  });
  const playoffTeams = Math.max(nDiv, 1) + Math.floor(r() * (K - Math.max(nDiv, 1)));
  const picks: Picks = {};
  for (const x of games) if (r() < 0.2) picks[x.id] = r() < 0.5 ? x.teamA : x.teamB;
  return { L: { teams, games, divisions: nDiv, playoffTeams: Math.min(playoffTeams, K) }, picks };
}

describe('property: a mark only appears when it is mathematically guaranteed', () => {
  it('holds for 300 random small leagues with every remaining outcome and every tiebreak order enumerated', () => {
    const r = rng(12345);
    const seen: Record<string, number> = { x: 0, y: 0, d: 0, e: 0, '': 0, winOut: 0 };
    for (let n = 0; n < 300; n++) {
      const { L, picks } = randomLeague(r);
      const facts = oracle(L, picks);
      const des = designations(L, picks);
      L.teams.forEach((t, i) => {
        const d = des[t.rid]!;
        const ctx = JSON.stringify({ L, picks, rid: t.rid });
        seen[d.mark] = (seen[d.mark] ?? 0) + 1;
        if (d.clinch) expect(facts.alwaysMakes[i], 'clinch ' + ctx).toBe(true);
        if (d.divClinch) expect(facts.alwaysDiv[i], 'divClinch ' + ctx).toBe(true);
        if (d.elim) expect(facts.neverMakes[i], 'elim ' + ctx).toBe(true);
        if (d.divOut) expect(facts.neverDiv[i], 'divOut ' + ctx).toBe(true);
        if (d.mark === 'y') expect(d.divClinch && d.clinch).toBe(true);
        if (d.mark === 'x') expect(facts.alwaysMakes[i]).toBe(true);
        if (d.mark === 'e') expect(d.clinch).toBe(false);
      });

      // winsToClinch promises: winning `spot` of the open games (or winning out) clinches a spot whatever else happens
      L.teams.forEach((t, i) => {
        const w = winsToClinch(L, t.rid, picks);
        if (w.spot == null) return;
        seen.winOut = (seen.winOut ?? 0) + (w.winOut ? 1 : 0);
        const open = L.games.filter((x) => picks[x.id] == null && (x.teamA === t.rid || x.teamB === t.rid)).map((x) => x.id);
        const need = w.spot;
        const facts2 = oracle(L, picks, (o) => open.filter((id) => o[id] === t.rid).length >= need);
        expect(facts2.alwaysMakes[i], `winsToClinch.spot ${need}/${open.length} ` + JSON.stringify({ L, picks, rid: t.rid })).toBe(true);
        if (w.div != null) {
          const facts3 = oracle(L, picks, (o) => open.filter((id) => o[id] === t.rid).length >= w.div!);
          expect(facts3.alwaysDiv[i], 'winsToClinch.div ' + JSON.stringify({ L, picks, rid: t.rid })).toBe(true);
        }
      });
    }
    // the random leagues must actually exercise every kind of mark, or the property proves nothing
    expect(seen.x).toBeGreaterThan(5);
    expect(seen.y).toBeGreaterThan(5);
    expect(seen.e).toBeGreaterThan(5);
    expect(seen.d).toBeGreaterThan(0);
    expect(seen.winOut).toBeGreaterThan(0);
  }, 120_000);
});
