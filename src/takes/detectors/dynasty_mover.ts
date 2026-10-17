/* dynasty_mover: dynasty leagues only. Among QB/RB/WR/TE in FantasyCalc worth at least MIN_DYNASTY_VALUE with a 30-day
   change (and a positive value 30 days ago, so new listings are not movers), the ones whose change is in the top (or
   bottom) `tail_pct` of that list, i.e. the ceil(tail_pct x n) largest (smallest) changes. Up needs a positive change,
   down a negative one. Needs MIN_DYNASTY_POPULATION players to rank against. */
import { MIN_DYNASTY_POPULATION, MIN_DYNASTY_VALUE, ctxFor, isNum, over, type Candidate, type Detector } from '../common.ts';

const POS = new Set(['QB', 'RB', 'WR', 'TE']);

/** How many players make up the tail: the top (or bottom) `tailPct` of `n`, rounded up, at least 1. */
const tailSize = (n: number, tailPct: number) => Math.max(1, Math.ceil(tailPct * n - 1e-9));

export const dynastyMover: Detector = (inputs, th) => {
  if (!inputs.isDynasty || !inputs.fantasyCalc) return [];
  const c = ctxFor(inputs);
  const t = th.detectors.dynasty_mover;
  const pop = Object.values(inputs.fantasyCalc).filter((e) => POS.has(e.position) && isNum(e.trend30Day) && e.value >= MIN_DYNASTY_VALUE && e.value - e.trend30Day! > 0);
  if (pop.length < MIN_DYNASTY_POPULATION) return [];
  const sorted = pop.map((e) => e.trend30Day!).sort((a, b) => a - b);
  const k = tailSize(sorted.length, t.tail_pct);
  const hi = sorted[sorted.length - k]!;
  const lo = sorted[k - 1]!;
  const out: Candidate[] = [];
  for (const e of pop) {
    const trend = e.trend30Day!;
    const up = trend > 0 && trend >= hi;
    const down = trend < 0 && trend <= lo;
    if (!up && !down) continue;
    const p = c.byPid.get(e.sleeperId);
    const prior = e.value - trend;
    const edge = up ? hi : lo;
    const extreme = up ? sorted[sorted.length - 1]! : sorted[0]!;
    const week = inputs.week;
    out.push({
      id: `dynasty_mover:${e.sleeperId}:${week}`, kind: 'dynasty_mover', pid: e.sleeperId, player: p?.name ?? e.name, pos: p?.pos ?? e.position,
      team: p?.nfl ?? null, season: inputs.season, week, throughWeek: Math.max(0, inputs.week - 1), tone: up ? 'good' : 'bad',
      score: Math.round(over(trend, edge, extreme) * 1e4) / 1e4, sample: { label: 'players compared', n: pop.length }, dataLabel: null,
      sources: ['fantasycalc'], actions: ['profile', 'watchlist', 'trade'],
      facts: { kind: 'dynasty_mover', value: e.value, trend, pct: prior > 0 ? trend / prior : null, up, population: pop.length, tailPct: t.tail_pct },
    });
  }
  return out;
};
