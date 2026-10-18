import { describe, expect, it } from 'vitest';
import { createEngine } from '../index.ts';
import { sampleModel } from '../../test/fakes.ts';
import { draftGradeFromPicks } from './grade.ts';
import { momentModel, waiverInfo } from './adapt.ts';
import { emptySnapshots, oddsAtStartOf, parseSnapshots, recordFirstLook, SNAPSHOT_KEEP } from './snapshot.ts';

/** The 4-team sample league, week 5 of 8: I start Alex Arm (QB), Rex Runner (RB), Walt Wideout (WR) and bench Backup Wideout. */
const engine = () => createEngine(sampleModel());

describe('the model, flattened for the rules', () => {
  it('reads the matchup, the record and the lineup', () => {
    const m = momentModel(engine());
    expect(m).toMatchObject({ week: 5, teamName: 'Sunday Scaries', record: { w: 3, l: 1, t: 0 }, lastRegularWeek: 8 });
    expect(m.matchup).toMatchObject({ oppName: 'Reed Between the Lines', mine: 47, theirs: 46 });
    expect(m.matchup!.p).toBeGreaterThan(0.5);
    expect(m.starters.map((s) => s.name)).toEqual(['Alex Arm', 'Rex Runner', 'Walt Wideout']);
    // the lineup in Sleeper is already the best one
    expect(m.lineup).toEqual({ best: 47, swaps: [] });
    expect(m.injuries).toEqual([]);
  });

  it('finds the swap when the best lineup differs from the one set, and prices it', () => {
    const model = sampleModel();
    model.teams[0]!.starters = ['t1qb', 't1rb', 't1bw']; // the 6-point bench wideout is in, the 12-point one is out
    const m = momentModel(createEngine(model));
    expect(m.lineup!.best).toBe(47);
    expect(m.lineup!.swaps).toHaveLength(1);
    expect(m.lineup!.swaps[0]).toMatchObject({ inName: 'Walt Wideout', outName: 'Backup Wideout' });
    expect(m.lineup!.swaps[0]!.gain).toBeCloseTo(6, 5);
  });

  it('ignores a swap that is not worth the trouble', () => {
    const model = sampleModel();
    model.players.find((p) => p.pid === 't1bw')!.mu[5] = 11.8; // 0.2 behind the starter: noise
    model.teams[0]!.starters = ['t1qb', 't1rb', 't1bw'];
    expect(momentModel(createEngine(model)).lineup!.swaps).toEqual([]);
  });

  it('lists starters on the injury report with the best healthy bench player at that position as the fallback', () => {
    const model = sampleModel();
    const wr = model.players.find((p) => p.pid === 't1wr')!;
    wr.injury = 'Questionable';
    const m = momentModel(createEngine(model));
    expect(m.injuries).toHaveLength(1);
    expect(m.injuries[0]).toMatchObject({ name: 'Walt Wideout', pos: 'WR', status: 'questionable', fallback: { name: 'Backup Wideout', points: 6 } });
    // a starter who already played is not a risk any more; neither is one with a doubtful backup
    wr.playedThisWeek = true;
    expect(momentModel(createEngine(model)).injuries).toEqual([]);
    wr.playedThisWeek = false;
    model.players.find((p) => p.pid === 't1bw')!.injury = 'Out';
    expect(momentModel(createEngine(model)).injuries[0]!.fallback).toBeNull();
  });

  it('puts the top waiver add on the model once the board is worked out', () => {
    const e = engine();
    const info = waiverInfo(e, true)!;
    expect(info.faab).toBe(true);
    expect(info.top).toMatchObject({ pid: 'fa1', name: 'Free Agent Fran', pos: 'WR' });
    expect(info.top!.gain).toBeGreaterThan(0.3);
    expect(info.top!.bid).toBeGreaterThan(0);
    expect(momentModel(e).waiver).toBeNull(); // not computed: the rules do not guess
    expect(momentModel(e, { waiver: info }).waiver).toEqual(info);
  });

  it('carries the race: odds, the clinch maths, a handshake idea', () => {
    const m = momentModel(engine());
    expect(m.magic).toMatchObject({ clinched: false, eliminated: false });
    expect(m.magic!.open).toBeGreaterThan(0);
    expect(m.trade).toEqual({ give: 'Backup Wideout', get: 'Reed Receiver', partner: 'Reed Between the Lines', myGain: 3.2, theirGain: 1.1 });
    const pending = sampleModel();
    pending.oddsPending = true;
    expect(momentModel(createEngine(pending)).playoffPct).toBeNull();
    expect(momentModel(createEngine(pending)).titlePct).toBeNull();
  });

  it('the toilet bowl odds are mine only once the simulation is in', () => {
    const model = sampleModel();
    model.teams[0]!.flushPct = 0.12;
    model.teams[0]!.consolationPct = 0.3;
    model.teams[0]!.inToiletBowlPct = 0.4;
    const flush = momentModel(createEngine(model), { losers: { name: 'the toilet bowl', champ: 'toilet bowl champ', which: 'flush' } });
    expect(flush.losers).toEqual({ name: 'the toilet bowl', champ: 'toilet bowl champ', pct: 0.12, inPct: 0.4 });
    const cons = momentModel(createEngine(model), { losers: { name: 'the consolation prize', champ: 'consolation champ', which: 'consolation' } });
    expect(cons.losers!.pct).toBe(0.3);
    expect(momentModel(createEngine(model)).losers).toBeNull();
  });

  it('the last result is last week’s, or this week’s once every game is over', () => {
    const m = momentModel(engine());
    expect(m.lastResult).toMatchObject({ week: 4, oppName: 'Reed Between the Lines' });
    const model = sampleModel();
    model.history.push(
      { key: '5-1', week: 5, rid: 1, opp: 2, pts: 112.3, oppPts: 98, final: false },
      { key: '5-2', week: 5, rid: 2, opp: 1, pts: 98, oppPts: 112.3, final: false },
    );
    expect(momentModel(createEngine(model)).lastResult).toMatchObject({ week: 4 });
    expect(momentModel(createEngine(model), { weekOver: true }).lastResult).toEqual({ week: 5, mine: 112.3, theirs: 98, oppName: 'Reed Between the Lines' });
  });
});

describe('odds snapshots', () => {
  it('remember the first look at a week and keep it', () => {
    let s = emptySnapshots();
    s = recordFirstLook(s, 6, 0.66);
    expect(oddsAtStartOf(s, 6)).toBe(0.66);
    const again = recordFirstLook(s, 6, 0.9);
    expect(again).toBe(s);
    expect(oddsAtStartOf(recordFirstLook(s, 7, 0.74), 7)).toBe(0.74);
    expect(oddsAtStartOf(s, 5)).toBeNull();
  });

  it('keep the last few weeks, ignore junk and survive broken storage', () => {
    let s = emptySnapshots();
    for (let w = 1; w <= SNAPSHOT_KEEP + 3; w++) s = recordFirstLook(s, w, 0.5);
    expect(Object.keys(s.weeks)).toHaveLength(SNAPSHOT_KEEP);
    expect(oddsAtStartOf(s, 1)).toBeNull();
    expect(oddsAtStartOf(s, SNAPSHOT_KEEP + 3)).toBe(0.5);
    expect(recordFirstLook(emptySnapshots(), 3, Number.NaN)).toEqual(emptySnapshots());
    expect(parseSnapshots(null)).toEqual(emptySnapshots());
    expect(parseSnapshots('not json')).toEqual(emptySnapshots());
    expect(parseSnapshots('{"weeks":{"6":0.5,"x":1,"7":"no","8":2}}')).toEqual({ weeks: { 6: 0.5 } });
    expect(parseSnapshots(JSON.stringify(s))).toEqual(s);
  });
});

describe('a finished draft’s grade', () => {
  it('ranks every team’s best lineup from what it actually drafted', async () => {
    const { buildRankings } = await import('../draft/rankings.ts');
    const { sampleLeague, sampleSeasonProjections } = await import('../../test/fakes.ts');
    const rankings = buildRankings({ projections: sampleSeasonProjections(), league: sampleLeague, mode: 'redraft', players: null, fantasyCalc: null });
    const best = rankings.rows.slice(0, 12).map((r) => r.pid);
    // team 1 gets the top of the board, teams 2 and 3 split the rest
    const picks = best.map((pid, i) => ({ player_id: pid, roster_id: i < 4 ? 1 : i % 2 === 0 ? 2 : 3 }));
    const g = draftGradeFromPicks(rankings, picks, 1)!;
    expect(g.teams).toBe(3);
    expect(g.rank).toBe(1);
    expect(g.letter).toBe('A');
    const worst = draftGradeFromPicks(rankings, picks.map((p, i) => ({ ...p, roster_id: i >= 8 ? 1 : p.roster_id })), 1)!;
    expect(worst.rank).toBeGreaterThanOrEqual(1);
    expect(draftGradeFromPicks(rankings, picks, 9)).toBeNull();
    expect(draftGradeFromPicks(rankings, [], 1)).toBeNull();
  });
});
