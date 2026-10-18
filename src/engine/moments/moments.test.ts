import { describe, expect, it } from 'vitest';
import { RULES, byPriority, hero, isCurrent, momentFor, moments, ongoing } from './index.ts';
import type { LiveMatch, Moment, MomentCtx } from './index.ts';
import { HOUR } from './time.ts';
import { at, ctx, model, week7, week8 } from './test-helpers.ts';

const top = (c: MomentCtx) => moments(c)[0];
const ids = (c: MomentCtx) => moments(c).map((m) => m.id);
const get = (c: MomentCtx, id: string): Moment => {
  const m = moments(c).find((x) => x.id === id);
  if (!m) throw new Error(`no ${id} moment; got ${ids(c).join(', ')}`);
  return m;
};

const swap = { inName: 'tyjae spears', inPid: 'ts', outName: 'ceedee lamb', gain: 4.2 };
const flagged = { pid: 'wr2', name: 'jaxon smith-njigba', pos: 'WR', status: 'questionable', fallback: { name: 'backup wr', points: 9.4 } };

function liveMatch(o: Partial<LiveMatch> = {}): LiveMatch {
  return {
    mine: { name: 'icemen', pts: 95.04, left: [{ name: 'josh allen', pos: 'QB' }, { name: 'travis kelce', pos: 'TE' }, { name: 'bills d/st', pos: 'DEF' }] },
    theirs: { name: 'killa k im gay', pts: 58.8, left: [{ name: 'lamar jackson', pos: 'QB' }] },
    winP: 0.8, started: true, final: false, ...o,
  };
}

describe('a simulated week (Central time, week 7)', () => {
  it('Tuesday 8 pm: waivers process tonight, with the top add, its lift and the bid', () => {
    const m = top(ctx('2026-10-20T20:00'))!;
    expect(m.id).toBe('waivers-tonight');
    expect(m.title).toBe('waivers process tonight at 2:00 am');
    expect(m.detail).toBe('your top add is kyler murray (+19.0 lineup lift), bid $76');
    expect(m.action).toEqual({ label: 'open the waiver wire', to: '/waivers' });
    expect(m.countdownTo).toBe(at('2026-10-21T02:00'));
    expect(m.priority).toBe(86);
    expect(m.pages).toContain('waivers');
  });

  it('leaves the bid off in a league without FAAB, and says so when the wire has nothing', () => {
    const rolling = get(ctx('2026-10-20T20:00', { model: model({ waiver: { top: model().waiver!.top, faab: false } }) }), 'waivers-tonight');
    expect(rolling.detail).toBe('your top add is kyler murray (+19.0 lineup lift)');
    const empty = get(ctx('2026-10-20T20:00', { model: model({ waiver: { top: null, faab: true } }) }), 'waivers-tonight');
    expect(empty.detail).toBe('nobody on the wire beats your bench right now');
    expect(empty.priority).toBeLessThan(60);
    const unknown = get(ctx('2026-10-20T20:00', { model: model({ waiver: null }) }), 'waivers-tonight');
    expect(unknown.detail).toBe('set your claims before then');
  });

  it('Wednesday 10 am, after waivers: waivers cleared, re-check the lineup for the week', () => {
    const c = ctx('2026-10-21T10:00');
    const m = top(c)!;
    expect(m.id).toBe('waivers-cleared');
    expect(m.title).toBe('waivers cleared');
    expect(m.detail).toBe('see who you got, and re-check your lineup for week 7: your best lineup projects 112.4');
    expect(m.action.to).toBe('/team');
    expect(ids(c)).not.toContain('waivers-tonight');
  });

  it('Thursday 5 pm: game day starts tonight, how many starters play, and a countdown to kickoff', () => {
    const c = ctx('2026-10-22T17:00');
    const m = top(c)!;
    expect(m.id).toBe('game-day');
    expect(m.title).toBe('game day starts tonight at 7:15 pm');
    expect(m.detail).toBe('2 of your 6 starters play thursday · your lineup is optimal');
    expect(m.countdownTo).toBe(at('2026-10-22T19:15'));
    expect(m.precise).toBe(true);
    expect(ids(c)).not.toContain('waivers-cleared');
  });

  it('Thursday with a better lineup: the swap rides along in the game day line', () => {
    const c = ctx('2026-10-22T17:00', { model: model({ lineup: { best: 116.6, swaps: [swap] } }) });
    expect(get(c, 'game-day').detail).toBe('2 of your 6 starters play thursday · swap tyjae spears in for ceedee lamb for +4.2');
    expect(top(c)!.id).toBe('game-day');
    expect(ids(c)).toContain('lineup-swap');
  });

  it('Thursday when none of your starters play that night: a quiet, lower-priority nudge', () => {
    const none = model({ starters: model().starters.filter((s) => s.nfl !== 'BUF') });
    const m = get(ctx('2026-10-22T17:00', { model: none }), 'game-day');
    expect(m.detail).toBe('none of your 4 starters play thursday: your lineup can wait');
    expect(m.priority).toBeLessThan(60);
  });

  it('Friday: the injury report names the starter and the best bench fallback', () => {
    const c = ctx('2026-10-23T10:00', { schedule: { games: week7({ tnf: 'final' }), nextGames: week8() }, model: model({ injuries: [flagged], lineup: { best: 112.4, swaps: [swap] } }) });
    const m = top(c)!;
    expect(m.id).toBe('injury-risk');
    expect(m.title).toBe('injury report: jaxon smith-njigba is questionable');
    expect(m.detail).toBe('set a fallback: backup wr (9.4 points) is your best wr on the bench');
    // the swap is there too, just below
    expect(ids(c).indexOf('lineup-swap')).toBeGreaterThan(ids(c).indexOf('injury-risk'));
  });

  it('Friday with several flagged starters, or none on the bench to step in', () => {
    const two = get(ctx('2026-10-23T10:00', { model: model({ injuries: [flagged, { ...flagged, pid: 'te', name: 'travis kelce', pos: 'TE', status: 'doubtful', fallback: null }] }) }), 'injury-risk');
    expect(two.title).toBe('injury report: 2 starters are flagged');
    expect(two.detail).toBe('jaxon smith-njigba is questionable, travis kelce is doubtful');
    const none = get(ctx('2026-10-23T10:00', { model: model({ injuries: [{ ...flagged, fallback: null }] }) }), 'injury-risk');
    expect(none.detail).toBe('you have no wr on the bench to fall back on');
  });

  it('Saturday: swap the better player in, with the gain', () => {
    const c = ctx('2026-10-24T11:00', { schedule: { games: week7({ tnf: 'final' }), nextGames: week8() }, model: model({ lineup: { best: 116.6, swaps: [swap] } }) });
    const m = top(c)!;
    expect(m.id).toBe('lineup-swap');
    expect(m.title).toBe('swap tyjae spears in for ceedee lamb');
    expect(m.detail).toBe('+4.2 expected points · your best lineup projects 116.6');
    expect(m.priority).toBe(72);
  });

  it('Saturday with two swaps adds them up', () => {
    const c = ctx('2026-10-24T11:00', { model: model({ lineup: { best: 120.9, swaps: [swap, { inName: 'a', inPid: 'a', outName: 'b', gain: 2.1 }] } }) });
    const m = get(c, 'lineup-swap');
    expect(m.title).toBe('2 lineup swaps are worth +6.3');
    expect(m.detail).toBe('tyjae spears for ceedee lamb (+4.2), a for b (+2.1) · your best lineup projects 120.9');
  });

  it('Saturday with nothing to fix: the lineup is optimal', () => {
    const m = top(ctx('2026-10-24T11:00', { schedule: { games: week7({ tnf: 'final' }), nextGames: week8() } }))!;
    expect(m.id).toBe('lineup-ok');
    expect(m.title).toBe('your lineup is optimal');
    expect(m.detail).toBe('your best lineup projects 112.4 for week 7');
  });

  it('Sunday 10 am: the final check, inactives ~90 minutes before kickoff, with the specific risks', () => {
    const c = ctx('2026-10-25T10:00', { schedule: { games: week7({ tnf: 'final' }), nextGames: week8() }, model: model({ injuries: [flagged] }) });
    const m = top(c)!;
    expect(m.id).toBe('final-check');
    expect(m.title).toBe('final lineup check');
    expect(m.detail).toBe('inactives are announced ~90 minutes before the 12:00 pm kickoff · 1 of your starters plays then · watch jaxon smith-njigba (questionable)');
    // inactives drop at 10:30 central; after that the countdown is to the kickoff itself
    expect(m.countdownTo).toBe(at('2026-10-25T10:30'));
    expect(m.label).toBe('inactives');
    const later = get(ctx('2026-10-25T10:45', { schedule: { games: week7({ tnf: 'final' }), nextGames: week8() } }), 'final-check');
    expect(later.countdownTo).toBe(at('2026-10-25T12:00'));
    expect(later.label).toBe('kickoff');
    expect(later.detail).toContain('no starter is flagged');
  });

  it('Sunday 2 pm, games on: the live score leads', () => {
    const c = ctx('2026-10-25T14:00', { schedule: { games: week7({ tnf: 'final', s1: 'final', s2: 'live' }), nextGames: week8() }, live: liveMatch() });
    const m = top(c)!;
    expect(m.id).toBe('live-matchup');
    expect(m.title).toBe('icemen leads killa k im gay 95.0 to 58.8');
    expect(m.detail).toBe('80% to win · 3 of your starters left, 1 of theirs');
    expect(m.pill).toEqual({ text: 'icemen 95.0 · 58.8 · 80%', bar: 0.8 });
    expect(m.live).toBe(true);
    expect(m.action.to).toBe('/gameday');
  });

  it('the live score belongs to game days: gone once the day’s games are over, and not on a Friday', () => {
    const started = { live: liveMatch() };
    expect(ids(ctx('2026-10-23T11:00', { ...started, schedule: { games: week7({ tnf: 'final' }), nextGames: [] } }))).not.toContain('live-matchup');
    expect(ids(ctx('2026-10-22T23:30', { ...started, schedule: { games: week7({ tnf: 'final' }), nextGames: [] } }))).not.toContain('live-matchup');
    // between Sunday slots it stays
    expect(ids(ctx('2026-10-25T14:00', { ...started, schedule: { games: week7({ tnf: 'final', s1: 'final', s2: 'final' }), nextGames: [] } }))).toContain('live-matchup');
    // and Thursday night while the game is on
    expect(ids(ctx('2026-10-22T20:00', { ...started, schedule: { games: week7({ tnf: 'live' }), nextGames: [] } }))).toContain('live-matchup');
  });

  it('trailing and tied read right', () => {
    const behind = get(ctx('2026-10-25T14:00', { live: liveMatch({ mine: { name: 'icemen', pts: 40, left: [] }, winP: 0.2 }) }), 'live-matchup');
    expect(behind.title).toBe('icemen trails killa k im gay 40.0 to 58.8');
    const tied = get(ctx('2026-10-25T14:00', { live: liveMatch({ mine: { name: 'icemen', pts: 58.8, left: [] } }) }), 'live-matchup');
    expect(tied.title).toBe('icemen ties killa k im gay 58.8 to 58.8');
  });

  it('Monday 8 pm, only Monday night left: you need 12.4 from the player still to play', () => {
    const games = week7({ tnf: 'final', s1: 'final', s2: 'final', s3: 'final', mnf: 'live' });
    const live = liveMatch({ mine: { name: 'icemen', pts: 101.3, left: [{ name: 'joe burrow', pos: 'QB' }] }, theirs: { name: 'killa k im gay', pts: 113.7, left: [] }, winP: 0.31 });
    const c = ctx('2026-10-26T20:00', { schedule: { games, nextGames: week8() }, live });
    const m = top(c)!;
    expect(m.id).toBe('monday-night');
    expect(m.title).toBe('it comes down to monday night');
    expect(m.detail).toBe('you need 12.4 from joe burrow');
    expect(m.priority).toBeGreaterThan(get(c, 'live-matchup').priority);
  });

  it('Monday night variations: you lead, they need it, both sides still to play', () => {
    const games = week7({ tnf: 'final', s1: 'final', s2: 'final', s3: 'final', mnf: 'live' });
    const base = { schedule: { games, nextGames: week8() } };
    const lead = get(ctx('2026-10-26T20:00', { ...base, live: liveMatch({ mine: { name: 'icemen', pts: 120, left: [{ name: 'joe burrow', pos: 'QB' }] }, theirs: { name: 'killa k im gay', pts: 113.7, left: [] }, winP: 0.9 }) }), 'monday-night');
    expect(lead.detail).toBe('you lead by 6.3 and only joe burrow is left to play');
    const they = get(ctx('2026-10-26T20:00', { ...base, live: liveMatch({ mine: { name: 'icemen', pts: 120, left: [] }, theirs: { name: 'killa k im gay', pts: 113.7, left: [{ name: 'tee higgins', pos: 'WR' }, { name: 'ja’marr chase', pos: 'WR' }] }, winP: 0.7 }) }), 'monday-night');
    expect(they.detail).toBe('you lead by 6.3; killa k im gay needs 6.3 from tee higgins and ja’marr chase');
    const both = get(ctx('2026-10-26T20:00', { ...base, live: liveMatch({ mine: { name: 'icemen', pts: 100, left: [{ name: 'joe burrow', pos: 'QB' }] }, theirs: { name: 'killa k im gay', pts: 103.7, left: [{ name: 'tee higgins', pos: 'WR' }] }, winP: 0.45 }) }), 'monday-night');
    expect(both.detail).toBe('you trail by 3.7 · you have joe burrow, they have tee higgins');
  });

  it('is not Monday night when the matchup is decided, or Sunday games are still on', () => {
    const games = week7({ tnf: 'final', s1: 'final', s2: 'final', s3: 'final', mnf: 'live' });
    const left = [{ name: 'joe burrow', pos: 'QB' }];
    expect(ids(ctx('2026-10-26T20:00', { schedule: { games, nextGames: [] }, live: liveMatch({ winP: 0.99, mine: { name: 'icemen', pts: 150, left } }) }))).not.toContain('monday-night');
    expect(ids(ctx('2026-10-25T14:00', { schedule: { games: week7({ tnf: 'final', s1: 'live' }), nextGames: [] }, live: liveMatch() }))).not.toContain('monday-night');
  });

  it('Tuesday 9 am: the recap, with the odds before and after from the stored snapshot', () => {
    const games = week7({ tnf: 'final', s1: 'final', s2: 'final', s3: 'final', mnf: 'final' });
    const c = ctx('2026-10-27T09:00', {
      schedule: { games, nextGames: week8() }, previous: { week: 7, playoffPct: 0.66 },
      model: model({ lastResult: { week: 7, mine: 112.3, theirs: 98, oppName: 'killa k im gay' } }),
    });
    const m = top(c)!;
    expect(m.id).toBe('week-recap');
    expect(m.title).toBe('week 7 recap: you won 112.3–98.0');
    expect(m.detail).toBe('against killa k im gay · playoff odds 66% → 74%');
    // waivers are the next thing, but the recap is the news this morning
    expect(ids(c)).toContain('waivers-tonight');
    expect(m.priority).toBeGreaterThan(get(c, 'waivers-tonight').priority);
  });

  it('the recap without a stored snapshot leaves the delta out; a loss reads as one; no odds falls back to the record', () => {
    const lost = model({ lastResult: { week: 7, mine: 90, theirs: 98, oppName: 'killa k im gay' } });
    const games = week7({ tnf: 'final', s1: 'final', s2: 'final', s3: 'final', mnf: 'final' });
    const none = get(ctx('2026-10-27T09:00', { schedule: { games, nextGames: [] }, model: lost }), 'week-recap');
    expect(none.title).toBe('week 7 recap: you lost 90.0–98.0');
    expect(none.detail).toBe('against killa k im gay · playoff odds 74%');
    // a snapshot from another week is not this week's "before"
    const old = get(ctx('2026-10-27T09:00', { schedule: { games, nextGames: [] }, model: lost, previous: { week: 6, playoffPct: 0.5 } }), 'week-recap');
    expect(old.detail).toBe('against killa k im gay · playoff odds 74%');
    const noOdds = get(ctx('2026-10-27T09:00', { schedule: { games, nextGames: [] }, model: model({ ...lost, playoffPct: null }) }), 'week-recap');
    expect(noOdds.detail).toBe('against killa k im gay · now 4–2');
  });

  it('Tuesday evening: waivers lead again and the recap steps back', () => {
    const c = ctx('2026-10-27T20:00', { model: model({ lastResult: { week: 7, mine: 112.3, theirs: 98, oppName: 'killa k im gay' } }) });
    expect(top(c)!.id).toBe('waivers-tonight');
    expect(get(c, 'week-recap').priority).toBeLessThan(get(c, 'waivers-tonight').priority);
  });
});

describe('draft season', () => {
  const draft = (o: Partial<NonNullable<MomentCtx['draft']>> = {}) => ({
    status: 'pre_draft' as const, startTime: at('2026-08-23T19:00'), mySlot: 9, teams: 12, picksUntilMine: null, tierPos: 'rb', grade: null, ...o,
  });
  const pre = (when: string, o: Partial<MomentCtx> = {}) => ctx(when, { phase: 'pre_draft', model: null, nflState: { week: 1, season: '2026', season_type: 'pre' }, schedule: { games: [], nextGames: [] }, draft: draft(), prep: { mock: false, tiers: false, queue: false }, ...o });

  it('pre-draft: the countdown leads, then the mock at your real slot, the tier to study and the empty queue', () => {
    const c = pre('2026-08-20T14:48');
    const list = moments(c);
    expect(list.map((m) => m.id)).toEqual(['draft-countdown', 'draft-mock', 'draft-tiers', 'draft-queue']);
    expect(list[0]!.title).toBe('the draft starts in 3d 4h');
    expect(list[0]!.detail).toBe('sunday at 7:00 pm · you pick 9th of 12');
    expect(list[0]!.countdownTo).toBe(at('2026-08-23T19:00'));
    expect(list[1]!.title).toBe('run a mock draft at your real slot (9th)');
    expect(list[2]!.title).toBe('study rb tier 2');
    expect(list[3]!.title).toBe('your queue is empty');
  });

  it('prep that is done does not come back; the countdown grows louder inside a day', () => {
    const c = pre('2026-08-23T12:00', { prep: { mock: true, tiers: true, queue: true } });
    expect(ids(c)).toEqual(['draft-countdown']);
    expect(top(c)!.priority).toBe(85);
    expect(top(c)!.title).toBe('the draft starts in 7h 0m');
  });

  it('pre-draft without a slot or a time still has something honest to say', () => {
    const c = pre('2026-08-20T14:48', { draft: draft({ mySlot: null, startTime: null, tierPos: null }) });
    expect(ids(c)).toEqual(['draft-mock', 'draft-queue']);
    expect(get(c, 'draft-mock').title).toBe('run a mock draft');
  });

  it('drafting: on the clock in N picks, then on the clock', () => {
    const base = { phase: 'drafting' as const, model: null, prep: null };
    const four = top(ctx('2026-08-23T19:30', { ...base, draft: draft({ status: 'drafting', picksUntilMine: 4 }) }))!;
    expect(four.title).toBe('you’re on the clock in 4 picks');
    expect(four.pill).toEqual({ text: 'on the clock in 4 picks' });
    expect(four.live).toBe(true);
    const one = top(ctx('2026-08-23T19:30', { ...base, draft: draft({ status: 'drafting', picksUntilMine: 1 }) }))!;
    expect(one.title).toBe('you’re on the clock in 1 pick');
    expect(one.priority).toBe(95);
    const now = top(ctx('2026-08-23T19:30', { ...base, draft: draft({ status: 'drafting', picksUntilMine: 0 }) }))!;
    expect(now.title).toBe('you’re on the clock');
    expect(now.priority).toBe(99);
    const paused = top(ctx('2026-08-23T19:30', { ...base, draft: draft({ status: 'paused', picksUntilMine: 0 }) }))!;
    expect(paused.detail).toBe('the draft is paused');
    const unknown = top(ctx('2026-08-23T19:30', { ...base, draft: draft({ status: 'drafting', picksUntilMine: null }) }))!;
    expect(unknown.title).toBe('the draft is live');
  });

  it('after the draft: your grade', () => {
    const c = ctx('2026-09-02T10:00', { draft: draft({ status: 'complete', grade: { letter: 'B', rank: 4, teams: 12 } }), model: null });
    const m = get(c, 'draft-grade');
    expect(m.title).toBe('your draft grade: B');
    expect(m.detail).toBe('your lineup ranks 4th of 12');
  });
});

describe('the season and the offseason', () => {
  it('trade deadline: the week before, with a countdown and the best handshake deal', () => {
    const trade = { give: 'backup wideout', get: 'reed receiver', partner: 'hail mary club', myGain: 3.2, theirGain: 1.1 };
    const c = ctx('2026-11-02T10:00', {
      model: model({ week: 10, trade }), nflState: { week: 10, season: '2026', season_type: 'regular' },
      schedule: { games: [], nextGames: [{ id: 'n', home: 'A', away: 'B', kickoff: at('2026-11-05T19:15'), state: 'pre' }] },
    });
    const m = get(c, 'trade-deadline');
    expect(m.title).toBe('trade deadline: week 11');
    expect(m.detail).toBe('week 11 starts in 3d 9h · best handshake deal: send backup wideout to hail mary club for reed receiver (+3.2 you, +1.1 them)');
    expect(m.pages).toContain('trades');
    // deadline week itself
    const last = get(ctx('2026-11-09T10:00', { model: model({ week: 11 }) }), 'trade-deadline');
    expect(last.detail).toBe('week 11 is the last week to trade');
    expect(last.priority).toBeGreaterThan(m.priority);
    // not in the other weeks, or with no deadline set
    expect(ids(ctx('2026-10-26T10:00'))).not.toContain('trade-deadline');
    expect(ids(ctx('2026-11-02T10:00', { model: model({ week: 10 }), settings: {} }))).not.toContain('trade-deadline');
  });

  it('clinch scenarios: win and you’re in, one more win, win out', () => {
    const mg = (spot: number | null, open: number, winOut = false) => model({ magic: { spot, open, winOut, clinched: false, eliminated: false } });
    expect(get(ctx('2026-12-02T10:00', { model: mg(1, 1) }), 'clinch').title).toBe('win and you’re in');
    expect(get(ctx('2026-12-02T10:00', { model: mg(1, 1) }), 'clinch').detail).toBe('a win this week clinches a playoff spot · you are at 74% now');
    expect(get(ctx('2026-12-02T10:00', { model: mg(1, 3) }), 'clinch').title).toBe('one more win and you’re in');
    expect(get(ctx('2026-12-02T10:00', { model: mg(2, 2, true) }), 'clinch').title).toBe('win out and you’re in');
    expect(get(ctx('2026-12-02T10:00', { model: mg(2, 2, true) }), 'clinch').detail).toBe('win all 2 remaining games to clinch a spot · you are at 74% now');
    expect(ids(ctx('2026-12-02T10:00', { model: mg(3, 7) }))).not.toContain('clinch');
    expect(ids(ctx('2026-12-02T10:00', { model: mg(null, 3) }))).not.toContain('clinch');
  });

  it('clinched, and the toilet bowl for a team that is out', () => {
    const clinched = get(ctx('2026-12-02T10:00', { model: model({ magic: { spot: 0, open: 3, winOut: false, clinched: true, eliminated: false } }) }), 'clinched');
    expect(clinched.title).toBe('you’re in: playoff spot clinched');
    expect(clinched.detail).toBe('4–2 and a bracket spot is yours · 9% to win the title');
    const out = model({ playoffPct: 0, magic: { spot: null, open: 3, winOut: false, clinched: false, eliminated: true }, losers: { name: 'the toilet bowl', champ: 'toilet bowl champ', pct: 0.31, inPct: 1 } });
    const m = get(ctx('2026-12-02T10:00', { model: out }), 'toilet-bowl');
    expect(m.title).toBe('the toilet bowl: you’re in it');
    expect(m.detail).toBe('31% to be crowned toilet bowl champ');
    // a team still in the race is not in it
    expect(ids(ctx('2026-12-02T10:00', { model: model({ losers: { name: 'the toilet bowl', champ: 'toilet bowl champ', pct: 0.02, inPct: 0.1 } }) }))).not.toContain('toilet-bowl');
  });

  it('playoffs: in the bracket with a matchup and title odds', () => {
    const c = ctx('2026-12-10T10:00', {
      phase: 'postseason', nflState: { week: 15, season: '2026', season_type: 'regular' },
      model: model({ week: 15, playoffPct: 1, titlePct: 0.14, matchup: { oppName: 'hail mary club', mine: 120, theirs: 110, p: 0.64 } }),
    });
    const m = get(c, 'playoffs');
    expect(m.title).toBe('playoffs, round 1: you’re in the bracket');
    expect(m.detail).toBe('week 15: 64% to beat hail mary club · 14% to win it all');
  });

  it('offseason: dynasty movers and rookie draft prep', () => {
    const c = ctx('2027-02-10T10:00', {
      phase: 'offseason', model: null, nflState: { week: 1, season: '2026', season_type: 'off' }, schedule: { games: [], nextGames: [] },
      offseason: { movers: [{ name: 'jordan love', delta: 320 }, { name: 'walt wideout', delta: -150 }, { name: 'rex runner', delta: 40 }], rookies: [{ name: 'cam ward', pos: 'QB' }, { name: 'ashton jeanty', pos: 'RB' }] },
    });
    expect(ids(c)).toEqual(['dynasty-movers', 'rookie-prep']);
    expect(get(c, 'dynasty-movers').title).toBe('dynasty movers: jordan love +320 in 30 days');
    expect(get(c, 'dynasty-movers').detail).toBe('walt wideout −150 · rex runner +40');
    expect(get(c, 'rookie-prep').title).toBe('rookie draft prep: cam ward leads the class');
    expect(get(c, 'rookie-prep').detail).toBe('the top 2: cam ward (qb), ashton jeanty (rb)');
  });

  it('a hot take on my player rounds out the plan', () => {
    const m = get(ctx('2026-10-23T10:00', { takes: [{ id: 't', pid: 'p', headline: 'walt wideout’s snap share jumped 18 points', statLine: '71% of snaps over the last 3 weeks' }] }), 'take');
    expect(m.title).toBe('walt wideout’s snap share jumped 18 points');
    expect(m.action.to).toBe('/takes');
  });
});

describe('priority and expiry', () => {
  it('sorts by priority, best first, with ties by id', () => {
    const list = moments(ctx('2026-10-22T17:00', { model: model({ lineup: { best: 116.6, swaps: [swap] } }) }));
    for (let i = 1; i < list.length; i++) expect(byPriority(list[i - 1]!, list[i]!)).toBeLessThanOrEqual(0);
    expect(list[0]!.priority).toBeGreaterThanOrEqual(list[list.length - 1]!.priority);
    const a = { id: 'a', priority: 5 } as Moment, b = { id: 'b', priority: 5 } as Moment;
    expect([b, a].sort(byPriority).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('is pure: the same context gives the same moments', () => {
    const c = ctx('2026-10-22T17:00');
    expect(moments(c)).toEqual(moments(c));
  });

  it('a moment is current from startsAt up to, not including, endsAt', () => {
    const m = { startsAt: 10, endsAt: 20 } as Moment;
    expect([9, 10, 19, 20].map((n) => isCurrent(m, n))).toEqual([false, true, true, false]);
    expect(isCurrent({} as Moment, 5)).toBe(true);
  });

  it('game day expires at kickoff, waivers at the run, the swap after the last game', () => {
    expect(ids(ctx('2026-10-22T19:14'))).toContain('game-day');
    expect(ids(ctx('2026-10-22T19:15'))).not.toContain('game-day');
    expect(ids(ctx('2026-10-21T01:59'))).toContain('waivers-tonight');
    expect(ids(ctx('2026-10-21T02:00'))).not.toContain('waivers-tonight');
    expect(ids(ctx('2026-10-21T02:00'))).toContain('waivers-cleared');
    expect(ids(ctx('2026-10-22T02:00'))).not.toContain('waivers-cleared');
    const swaps = model({ lineup: { best: 100, swaps: [swap] } });
    expect(ids(ctx('2026-10-26T19:00', { model: swaps }))).toContain('lineup-swap');
    expect(ids(ctx('2026-10-26T19:15', { model: swaps }))).not.toContain('lineup-swap');
    // Friday’s injury report is over by Sunday (the final check carries the risks); the final check is over at kickoff
    expect(ids(ctx('2026-10-25T10:00', { model: model({ injuries: [flagged] }) }))).not.toContain('injury-risk');
    expect(ids(ctx('2026-10-25T12:00'))).not.toContain('final-check');
  });

  it('the recap is only for Tuesday and the final check only for Sunday', () => {
    const r = model({ lastResult: { week: 7, mine: 112.3, theirs: 98, oppName: 'x' } });
    expect(ids(ctx('2026-10-28T09:00', { model: r }))).not.toContain('week-recap');
    expect(ids(ctx('2026-10-26T09:00', { model: r }))).not.toContain('week-recap');
    expect(ids(ctx('2026-10-24T10:00'))).not.toContain('final-check');
  });

  it('moments are not issued before they start', () => {
    // Monday morning is more than 30 hours before the run: no waivers nudge yet
    expect(ids(ctx('2026-10-26T08:00'))).not.toContain('waivers-tonight');
    expect(ids(ctx('2026-10-27T00:00'))).toContain('waivers-tonight');
  });
});

describe('missing data', () => {
  it('no phase, no moments', () => {
    expect(moments(ctx('2026-10-22T17:00', { phase: null }))).toEqual([]);
  });

  it('without a model, the timing moments still fire but quote no numbers they do not have', () => {
    const c = ctx('2026-10-22T17:00', { model: null });
    const m = get(c, 'game-day');
    expect(m.detail).toBe('set your lineup before kickoff');
    expect(ids(c)).not.toContain('lineup-swap');
    expect(get(ctx('2026-10-20T20:00', { model: null }), 'waivers-tonight').detail).toBe('set your claims before then');
    expect(ids(ctx('2026-10-27T09:00', { model: null }))).not.toContain('week-recap');
    expect(ids(ctx('2026-10-21T10:00', { model: null, nflState: null }))).not.toContain('waivers-cleared');
  });

  it('without kickoff times there is no game day, final check or Monday night', () => {
    const none = { games: [], nextGames: [] };
    expect(ids(ctx('2026-10-22T17:00', { schedule: none }))).not.toContain('game-day');
    expect(ids(ctx('2026-10-25T10:00', { schedule: none }))).not.toContain('final-check');
    expect(ids(ctx('2026-10-26T20:00', { schedule: none, live: liveMatch({ winP: 0.4 }) }))).not.toContain('monday-night');
  });

  it('without live data there is no live moment; before the first point it is not a live matchup', () => {
    expect(ids(ctx('2026-10-25T14:00'))).not.toContain('live-matchup');
    expect(ids(ctx('2026-10-25T14:00', { live: liveMatch({ started: false }) }))).not.toContain('live-matchup');
    expect(ids(ctx('2026-10-25T14:00', { live: liveMatch({ final: true }) }))).not.toContain('live-matchup');
  });

  it('without a trade idea the deadline still names the week; without odds the clinch line leaves them out', () => {
    const d = get(ctx('2026-11-09T10:00', { model: model({ week: 11, trade: null }) }), 'trade-deadline');
    expect(d.detail).toBe('week 11 is the last week to trade');
    const c = get(ctx('2026-12-02T10:00', { model: model({ playoffPct: null, magic: { spot: 1, open: 1, winOut: false, clinched: false, eliminated: false } }) }), 'clinch');
    expect(c.detail).toBe('a win this week clinches a playoff spot');
  });

  it('draft moments need a draft, and a rule that throws does not take the others down', () => {
    expect(moments(ctx('2026-08-20T10:00', { phase: 'pre_draft', draft: null }))).toEqual([]);
    const bad = ctx('2026-10-22T17:00', { model: { ...model(), starters: undefined as never } });
    expect(() => moments(bad)).not.toThrow();
    expect(RULES.length).toBeGreaterThan(10);
  });
});

describe('what the live activity and the banners pick', () => {
  it('shows only live moments and countdowns that are close', () => {
    expect(ongoing(moments(ctx('2026-10-20T20:00')), at('2026-10-20T20:00')).map((m) => m.id)).toEqual(['waivers-tonight']);
    // 17 hours before the run: the huddle knows, the pill does not
    expect(ongoing(moments(ctx('2026-10-20T09:00')), at('2026-10-20T09:00'))).toEqual([]);
    // Wednesday morning has nothing ticking
    expect(ongoing(moments(ctx('2026-10-21T10:00')), at('2026-10-21T10:00'))).toEqual([]);
    expect(ongoing(moments(ctx('2026-10-22T17:00')), at('2026-10-22T17:00')).map((m) => m.id)).toEqual(['game-day']);
    // more than six hours before Thursday kickoff: the game-day line is a plan item, not an activity
    expect(ongoing(moments(ctx('2026-10-22T09:00')), at('2026-10-22T09:00'))).toEqual([]);
    const live = ctx('2026-10-25T14:00', { live: liveMatch() });
    expect(ongoing(moments(live), live.now.getTime())[0]!.id).toBe('live-matchup');
  });

  it('stops showing a countdown that has reached zero', () => {
    const m = get(ctx('2026-10-22T17:00'), 'game-day');
    expect(ongoing([m], m.countdownTo! - 1)).toHaveLength(1);
    expect(ongoing([m], m.countdownTo!)).toHaveLength(0);
    expect(ongoing([m], m.countdownTo! - 7 * HOUR)).toHaveLength(0);
  });

  it('picks the best moment for a page', () => {
    const list = moments(ctx('2026-10-20T20:00'));
    expect(momentFor(list, 'waivers')!.id).toBe('waivers-tonight');
    expect(momentFor(list, 'trades')).toBeNull();
    expect(momentFor(list, 'draft')).toBeNull();
    const draftList = moments(ctx('2026-08-20T14:48', { phase: 'pre_draft', model: null, draft: { status: 'pre_draft', startTime: at('2026-08-23T19:00'), mySlot: 9, teams: 12, picksUntilMine: null, tierPos: null, grade: null }, prep: { mock: false, tiers: true, queue: true } }));
    expect(momentFor(draftList, 'draft')!.id).toBe('draft-countdown');
    const team = moments(ctx('2026-10-22T17:00'));
    expect(momentFor(team, 'team')!.id).toBe('game-day');
  });
});

describe('the huddle sentence', () => {
  it('live: leads, trails or ties, with the odds from here', () => {
    const h = hero(ctx('2026-10-25T14:00', { live: liveMatch() }))!;
    expect(h.kind).toBe('live');
    expect(h.sentence).toBe('icemen leads killa k im gay 95.0 to 58.8.');
    expect(h.odds).toBe('you win 80 of every 100 simulations from here');
    expect(hero(ctx('2026-10-25T14:00', { live: liveMatch({ mine: { name: 'icemen', pts: 40, left: [] } }) }))!.sentence).toBe('icemen trails killa k im gay 40.0 to 58.8.');
    expect(hero(ctx('2026-10-25T14:00', { live: liveMatch({ mine: { name: 'icemen', pts: 58.8, left: [] } }) }))!.sentence).toBe('icemen is tied with killa k im gay 58.8 to 58.8.');
  });

  it('pre-game: faces the opponent with the win chance in words', () => {
    const h = hero(ctx('2026-10-22T17:00'))!;
    expect(h.kind).toBe('pre');
    expect(h.sentence).toBe('icemen faces killa k im gay this week. 36% to win.');
    expect(h.odds).toBe('you win 36 of every 100 simulations');
    expect(hero(ctx('2026-10-22T17:00', { live: liveMatch({ started: false }) }))!.sentence).toBe('icemen faces killa k im gay this week. 36% to win.');
  });

  it('final: beat, lost to or tied', () => {
    expect(hero(ctx('2026-10-27T09:00', { live: liveMatch({ final: true, mine: { name: 'icemen', pts: 112.3, left: [] }, theirs: { name: 'killa k im gay', pts: 98, left: [] } }) }))!.sentence).toBe('icemen beat killa k im gay 112.3 to 98.0.');
    expect(hero(ctx('2026-10-27T09:00', { live: liveMatch({ final: true, mine: { name: 'icemen', pts: 90, left: [] }, theirs: { name: 'killa k im gay', pts: 98, left: [] } }) }))!.sentence).toBe('icemen lost to killa k im gay 90.0 to 98.0.');
    expect(hero(ctx('2026-10-27T09:00', { live: liveMatch({ final: true, mine: { name: 'icemen', pts: 98, left: [] }, theirs: { name: 'killa k im gay', pts: 98, left: [] } }) }))!.kind).toBe('final');
  });

  it('a finished week with no live layer still reads as final, from the model', () => {
    const done = model({ lastResult: { week: 7, mine: 112.3, theirs: 98, oppName: 'killa k im gay' } });
    expect(hero(ctx('2026-10-27T09:00', { model: done }))!.sentence).toBe('icemen beat killa k im gay 112.3 to 98.0.');
    // last week’s result is not this week’s sentence
    expect(hero(ctx('2026-10-27T09:00', { model: { ...done, week: 8 } }))!.kind).toBe('pre');
  });

  it('a bye week, the draft and the offseason have their own', () => {
    expect(hero(ctx('2026-10-22T17:00', { model: model({ matchup: null }) }))!.sentence).toBe('icemen has no game this week.');
    const d = { status: 'pre_draft' as const, startTime: at('2026-08-23T19:00'), mySlot: 9, teams: 12, picksUntilMine: null, tierPos: null, grade: null };
    const pre = { phase: 'pre_draft' as const, model: null, draft: d };
    expect(hero(ctx('2026-08-20T14:48', pre))!.sentence).toBe('the draft starts in 3d 4h. you pick 9th of 12.');
    expect(hero(ctx('2026-08-24T14:48', pre))!.sentence).toBe('the draft has not started. you pick 9th of 12.');
    const dr = { phase: 'drafting' as const, model: null };
    expect(hero(ctx('2026-08-23T19:30', { ...dr, draft: { ...d, status: 'drafting', picksUntilMine: 4 } }))!.sentence).toBe('the draft is live. you’re on the clock in 4 picks.');
    expect(hero(ctx('2026-08-23T19:30', { ...dr, draft: { ...d, status: 'drafting', picksUntilMine: 0 } }))!.sentence).toBe('you’re on the clock.');
    expect(hero(ctx('2026-08-23T19:30', { ...dr, draft: { ...d, status: 'drafting' } }))!.sentence).toBe('the draft is live.');
    const off = hero(ctx('2027-02-10T10:00', { phase: 'offseason', model: null, lastSeason: { teamName: 'icemen', w: 8, l: 6, t: 0, rank: 4, teams: 12 } }))!;
    expect(off.sentence).toBe('icemen finished 8–6, 4th of 12.');
  });

  it('says nothing without data', () => {
    expect(hero(ctx('2026-10-22T17:00', { model: null }))).toBeNull();
    expect(hero(ctx('2027-02-10T10:00', { phase: 'offseason', model: null }))).toBeNull();
    expect(hero(ctx('2026-10-22T17:00', { phase: null }))).toBeNull();
  });
});
