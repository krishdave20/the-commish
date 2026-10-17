import { describe, expect, it } from 'vitest';
import { evaluateDynastyTrade, LENS_WEIGHTS, type DynastyTradeInput, type TradeAsset } from './trade.ts';

const player = (id: string, value: number | null, age: number | null): TradeAsset => ({ id, kind: 'player', label: id, value, age });
const pick = (id: string, value: number | null): TradeAsset => ({ id, kind: 'pick', label: id, value, age: null });

const redraft = (myReg: number, myPo = 0) => ({ myReg, myPo, weeks: [7, 14] as [number, number], playoffWeeks: [15, 16] });

/** Send a young star plus a pick for an older, productive veteran. */
function winNow(over: Partial<DynastyTradeInput> = {}): DynastyTradeInput {
  return {
    give: [player('young star', 6000, 22), pick('2027 1st', 3000)],
    get: [player('vet', 7000, 31)],
    lens: 'contender', redraft: redraft(9, 3), ...over,
  };
}

describe('dynasty trade evaluation', () => {
  it('sums value given and received with players and picks on both sides', () => {
    const e = evaluateDynastyTrade({
      give: [player('a', 4000, 24), pick('2027 1st', 3000), pick('2028 2nd', 1300)],
      get: [player('b', 5000, 28), pick('2029 1st', 1800)],
      lens: 'retool', redraft: redraft(0),
    });
    expect(e.given).toBe(8300);
    expect(e.received).toBe(6800);
    expect(e.net).toBe(-1500);
    expect(e.relNet).toBeCloseTo(-1500 / 8300, 10);
  });

  it('counts picks, and players 26 and under, as young value', () => {
    const e = evaluateDynastyTrade({
      give: [player('a', 4000, 26), player('b', 1000, 27), pick('p', 500)],
      get: [player('c', 2000, 23), player('d', 3000, 31)],
      lens: null, redraft: null,
    });
    expect(e.youngGiven).toBe(4500);
    expect(e.youngReceived).toBe(2000);
  });

  it('adding a pick to a side changes the net', () => {
    const base: DynastyTradeInput = { give: [player('a', 4000, 24)], get: [player('b', 3500, 24)], lens: 'rebuilder', redraft: null };
    const plain = evaluateDynastyTrade(base);
    const sweetened = evaluateDynastyTrade({ ...base, get: [...base.get, pick('2027 1st', 1500)] });
    expect(plain.net).toBe(-500);
    expect(sweetened.net).toBe(1000);
    expect(sweetened.score).toBeGreaterThan(plain.score);
  });

  it('a contender takes the win-now deal; a rebuilder passes on the same trade', () => {
    const contender = evaluateDynastyTrade(winNow({ lens: 'contender' }));
    const rebuilder = evaluateDynastyTrade(winNow({ lens: 'rebuilder' }));
    expect(contender.verdict).toBe('take it');
    expect(contender.message).toMatch(/^take it: as a contender, the lineup gain is what a contender is paying for\./);
    expect(rebuilder.verdict).toBe('pass');
    expect(rebuilder.message).toMatch(/^pass: as a rebuilder, a rebuilder wants value and youth, and this sends them out\./);
    expect(contender.score).toBeGreaterThan(rebuilder.score);
  });

  it('says the numbers in the sentence', () => {
    const e = evaluateDynastyTrade(winNow({ oddsDelta: 0.04 }));
    expect(e.message).toContain('dynasty value 9,000 out, 7,000 in, net −2,000');
    expect(e.message).toContain('you give up 9,000 of value in players 26 and under and picks');
    expect(e.message).toContain('your lineup moves +9.0 points over weeks 7–14 and +3.0 in the playoff weeks, and your playoff odds rise 4 points');
  });

  it('a rebuilder takes picks and youth for a veteran, a contender passes', () => {
    const sell: DynastyTradeInput = {
      give: [player('vet', 6000, 31)], get: [pick('2027 1st', 3000), player('kid', 4500, 21)],
      lens: 'rebuilder', redraft: redraft(-7, -2),
    };
    const r = evaluateDynastyTrade(sell), c = evaluateDynastyTrade({ ...sell, lens: 'contender' });
    expect(r.verdict).toBe('take it');
    expect(r.message).toContain('a rebuilder wants value and youth, and this brings both');
    expect(c.verdict).toBe('pass');
    expect(c.message).toContain('it costs lineup points a contender cannot spare');
  });

  it('a rebuilder is told when a deal brings value but not youth, or youth but not value', async () => {
    const valueOnly = evaluateDynastyTrade({ give: [player('kid', 3000, 22)], get: [player('vet', 5000, 30)], lens: 'rebuilder', redraft: null });
    expect(valueOnly.message).toContain('this brings value but not youth');
    const youthOnly = evaluateDynastyTrade({ give: [player('vet', 5000, 30)], get: [player('kid', 3000, 22)], lens: 'rebuilder', redraft: null });
    expect(youthOnly.message).toContain('this brings youth but not value');
  });

  it('all-in ignores most of the future cost; retool sits between', () => {
    const t = winNow({ redraft: redraft(4, 1) });
    const all = evaluateDynastyTrade({ ...t, lens: 'all-in' }), con = evaluateDynastyTrade({ ...t, lens: 'contender' });
    const retool = evaluateDynastyTrade({ ...t, lens: 'retool' }), reb = evaluateDynastyTrade({ ...t, lens: 'rebuilder' });
    expect(all.score).toBeGreaterThan(con.score);
    expect(con.score).toBeGreaterThan(retool.score);
    expect(retool.score).toBeGreaterThan(reb.score);
    expect(all.message).toContain('the lineup gain is the point and an all-in team does not mind the future value');
    expect(retool.message).toContain('a retooling team weighs future value first');
  });

  it('a close call sits between the take and pass thresholds', () => {
    const e = evaluateDynastyTrade({ give: [player('a', 3000, 27)], get: [player('b', 3050, 27)], lens: 'contender', redraft: redraft(0.2) });
    expect(e.verdict).toBe('close call');
    expect(e.score).toBeGreaterThan(-0.2);
    expect(e.score).toBeLessThan(0.2);
  });

  it('without values, only this season is scored and the message says so', () => {
    const e = evaluateDynastyTrade(winNow({ valuesAvailable: false, lens: 'rebuilder' }));
    expect(e.weights).toEqual({ now: 1, value: 0, youth: 0 });
    expect(e.verdict).toBe('take it'); // this season +12 points
    expect(e.message).toContain('fantasycalc values are unavailable, so only this season is scored');
    expect(e.given).toBe(0);
  });

  it('names assets with no value and counts them as 0', () => {
    const e = evaluateDynastyTrade({ give: [player('mystery', null, 25)], get: [pick('2027 3rd', 1100)], lens: 'rebuilder', redraft: null });
    expect(e.missing).toEqual(['mystery']);
    expect(e.net).toBe(1100);
    expect(e.message).toContain('fantasycalc has no value for mystery; counted as 0.');
  });

  it('works without a redraft evaluation or a lens (picks-only, lens not ready)', () => {
    const e = evaluateDynastyTrade({ give: [pick('p', 1000)], get: [pick('q', 2000)], lens: null, redraft: null });
    expect(e.nowPoints).toBe(0);
    expect(e.weights).toEqual(LENS_WEIGHTS.none);
    expect(e.message).toContain('this season is unscored');
    expect(e.message).toContain('no contender or rebuilder read yet');
  });

  it('an empty trade is a close call at zero', () => {
    const e = evaluateDynastyTrade({ give: [], get: [], lens: 'contender', redraft: redraft(0) });
    expect(e).toMatchObject({ given: 0, received: 0, net: 0, verdict: 'close call', score: 0 });
  });
});
