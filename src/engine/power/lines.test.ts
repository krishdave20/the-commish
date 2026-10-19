// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixtureModel } from '../test-helpers.ts';
import { MAX_LINE_WORDS, allVariants, bannedIn, lineCandidates, powerLine, wordCount } from './lines.ts';
import type { LineFacts } from './lines.ts';
import { buildPowerRankings } from './rankings.ts';
import { league } from './test-helpers.ts';

const base: LineFacts = {
  rid: 3, rank: 6, teams: 12, movement: 0, record: { w: 3, l: 2, t: 0 }, recordRank: 5, allPlay: { w: 30, l: 25 }, allPlayRank: 6,
  pfRank: 6, pfpg: 128.4, leagueAvgPf: 127.1, luck: 0.2, streak: null, lastPts: 120.4, lastVsAvg: -3.2, rosRank: null, weeksLeft: 9,
};
const f = (o: Partial<LineFacts>): LineFacts => ({ ...base, ...o });

const clean = (text: string) => {
  expect(wordCount(text), text).toBeLessThanOrEqual(MAX_LINE_WORDS);
  expect(text, text).toMatch(/\d/);
  expect(text, text).toBe(text.toLowerCase());
  expect(bannedIn(text), text).toEqual([]);
  expect(text, text).not.toMatch(/NaN|undefined|Infinity/);
};

describe('what the line is about', () => {
  it('the best all-play record with a record that lags says so', () => {
    const l = powerLine(f({ allPlayRank: 1, allPlay: { w: 41, l: 14 }, recordRank: 7, record: { w: 3, l: 2, t: 0 }, rid: 1 }));
    expect(l.kind).toBe('ap_leader');
    expect(l.text).toContain('41–14');
    expect(l.text).toContain('3–2');
  });
  it('three or more straight weeks under the average is a cold streak, with the move', () => {
    const l = powerLine(f({ streak: { dir: 'under', weeks: 4 }, movement: -3, rid: 2 }));
    expect(l.kind).toBe('cold');
    expect(l.text).toMatch(/four|4/);
    expect(l.text).toContain('down 3 spots');
  });
  it('luck of a win and a half or more is a luck line', () => {
    const l = powerLine(f({ luck: 1.5, record: { w: 4, l: 1, t: 0 }, rid: 1 }));
    expect(l.kind).toBe('luck_up');
    expect(l.text).toContain('+1.5');
    expect(powerLine(f({ luck: -1.6, rid: 1 })).text).toContain('-1.6');
  });
  it('a top roster that scores poorly: best roster on paper, ranked in points, climbing', () => {
    const l = powerLine(f({ rosRank: 1, pfRank: 9, movement: 2, rid: 1 }));
    expect(l.kind).toBe('paper_best');
    expect(l.text).toContain('9th');
    expect(l.text).toContain('climbing');
  });
  it('a big move names the spots and last week\'s score', () => {
    const l = powerLine(f({ movement: 4, lastPts: 142.3, lastVsAvg: 31.2, rid: 1 }));
    expect(l.kind).toBe('mover');
    expect(l.text).toContain('142.3');
    expect(l.text).toContain('4 spots');
  });
  it('the top scorer and the lowest scorer', () => {
    expect(powerLine(f({ pfRank: 1, pfpg: 150.2, rid: 1 })).kind).toBe('scorer');
    expect(powerLine(f({ pfRank: 12, pfpg: 99.9, rid: 1 })).kind).toBe('cellar');
    expect(powerLine(f({ allPlayRank: 12, recordRank: 11, allPlay: { w: 8, l: 47 }, rid: 1 })).kind).toBe('ap_last');
  });
  it('the all-play and record ranks far apart is its own line', () => {
    const l = powerLine(f({ allPlayRank: 2, recordRank: 7, rid: 1 }));
    expect(l.kind).toBe('ap_gap');
    expect(l.text).toContain('2nd');
    expect(l.text).toContain('7th');
  });
  it('a middling team still gets a line with numbers', () => {
    const l = powerLine(base);
    expect(l.kind).toBe('steady');
    clean(l.text);
  });
  it('the strongest candidate wins; the list is strongest first', () => {
    const c = lineCandidates(f({ allPlayRank: 1, streak: { dir: 'under', weeks: 3 }, luck: 1.2, rid: 4 }));
    expect(c[0]!.kind).toBe('ap_leader');
    for (let i = 1; i < c.length; i++) expect(c[i]!.strength).toBeLessThanOrEqual(c[i - 1]!.strength);
  });
});

describe('every wording', () => {
  const grid: LineFacts[] = [];
  for (const rid of [1, 2, 3, 7, 12]) {
    for (const movement of [null, -5, -1, 0, 1, 4]) {
      for (const rank of [1, 6, 12]) {
        grid.push(f({
          rid, movement, rank, allPlayRank: rank, pfRank: 13 - rank, recordRank: rank, rosRank: rank, luck: rank === 1 ? 1.8 : rank === 12 ? -1.8 : 0.3,
          streak: { dir: rank > 6 ? 'under' : 'over', weeks: 3 + (rid % 3) }, record: { w: 3, l: 2, t: rid === 7 ? 1 : 0 }, weeksLeft: 9, pfpg: 99.9 + rank,
        }));
      }
    }
  }
  it('every variant of every kind is 20 words or fewer, lowercase, has a number and no hype words', () => {
    for (const facts of grid) for (const text of allVariants(facts)) clean(text);
  });
  it('the chosen line is clean for every case', () => {
    for (const facts of grid) clean(powerLine(facts).text);
  });
  it('is deterministic: the same facts give the same line, and the wording is a function of the roster id', () => {
    for (const facts of grid) expect(powerLine(facts)).toEqual(powerLine({ ...facts }));
    const wordings = new Set(Array.from({ length: 30 }, (_, i) => powerLine(f({ rid: i + 1, streak: { dir: 'under', weeks: 3 } })).text.replace(/\d+(\.\d+)?/g, '#')));
    expect(wordings.size).toBeGreaterThan(1); // more than one wording is in use across teams
  });
  it('does not change when something unrelated to the kind changes (the same team keeps its wording week to week)', () => {
    const a = powerLine(f({ rid: 5, streak: { dir: 'under', weeks: 3 }, movement: -2 }));
    const b = powerLine(f({ rid: 5, streak: { dir: 'under', weeks: 4 }, movement: -2, lastPts: 90 }));
    expect(a.kind).toBe(b.kind);
    expect(a.text.replace(/three|four/, 'N').replace(/\d+\.\d/, '#')).toBe(b.text.replace(/three|four/, 'N').replace(/\d+\.\d/, '#'));
  });
  it('the banned list is the takes list: hype words are caught', () => {
    expect(bannedIn('a must start, wow!')).toEqual(expect.arrayContaining(['must', 'wow', '!']));
    expect(bannedIn('three straight weeks under the league average')).toEqual([]);
  });
});

describe('on real numbers', () => {
  it('every team\'s line in every week of the fixture league is clean', async () => {
    const { model } = await fixtureModel();
    const r = buildPowerRankings(model);
    expect(r.weeks.length).toBeGreaterThan(2);
    for (const w of r.weeks) for (const t of w.teams) clean(t.line);
  }, 60_000); // building the fixture model is slow when the whole suite runs at once
  it('and in the hand league', () => {
    for (const w of buildPowerRankings(league()).weeks) for (const t of w.teams) clean(t.line);
  });
});
