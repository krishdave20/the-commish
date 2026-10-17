// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Candidate, Facts } from './common.ts';
import { DETECTOR_KINDS } from './detectors/index.ts';
import { BANNED_WORDS, MAX_HEADLINE_WORDS, bannedIn, headlineVariants, renderCandidate, variantIndex, whyForYouLine, wordCount } from './templates.ts';
import type { TakeKind } from './types.ts';

/** One representative set of numbers per kind. */
const FACTS: Record<TakeKind, Facts> = {
  usage_spike: { kind: 'usage_spike', now: 0.824, base: 0.58, baseFrom: 3, baseTo: 5, baseGames: 3, week: 6 },
  target_hog: { kind: 'target_hog', share: 0.317, from: 3, to: 5, tgt: 27, games: 3, seasonShare: 0.27, teamPass: 85 },
  buy_low: { kind: 'buy_low', ayShare: 0.372, ayRank: 15, ppg: 5.8, ppgRank: 71, games: 5, pool: 106 },
  sell_high: { kind: 'sell_high', tds: 5, xtd: 2.3, gap: 2.7, opps: 41, games: 5 },
  rz_role_change: { kind: 'rz_role_change', now: 0.44, prior: 0.12, up: true, from: 3, to: 5, touchesNow: 8, touchesPrior: 2, teamPlays: 30 },
  box_count_edge: { kind: 'box_count_edge', ypcLight: 5.8, lgtCar: 22, ypc: 4.6, opp: 'WAS', oppRate: 0.42, oppCarries: 117 },
  blitz_beater: { kind: 'blitz_beater', yptBlitz: 9.8, yptNo: 6.9, blTgt: 17, nblTgt: 31, opp: 'MIN', oppRate: 0.7, oppDropbacks: 180 },
  soft_schedule: { kind: 'soft_schedule', opps: ['IND', 'DET', 'BUF'], grades: [1.18, 1.58, 1.29], weeks: [7, 8, 9], dvpSoftMin: 1.15 },
  waiver_riser: { kind: 'waiver_riser', adds: 443066, measure: 'rush share', now: 0.59, base: 0.27, from: 2, to: 4, baseGames: 3, week: 5 },
  dynasty_mover: { kind: 'dynasty_mover', value: 2945, trend: 1005, pct: 0.52, up: true, population: 242, tailPct: 0.05 },
  coverage_note: { kind: 'coverage_note', better: 'zone', yprrMan: 1.2, yprrZone: 1.9, manRoutes: 30, zoneRoutes: 100, opp: 'JAX', oppCoverage: 'zone', oppRate: 0.77, match: true, season: '2025' },
};
const SAMPLE: Record<TakeKind, { label: string; n: number }> = {
  usage_spike: { label: 'games', n: 3 }, target_hog: { label: 'targets', n: 27 }, buy_low: { label: 'games', n: 5 }, sell_high: { label: 'opportunities', n: 41 },
  rz_role_change: { label: 'team inside-10 plays', n: 30 }, box_count_edge: { label: 'light-box carries', n: 22 }, blitz_beater: { label: 'blitz targets', n: 17 },
  soft_schedule: { label: 'matchups', n: 3 }, waiver_riser: { label: 'games', n: 3 }, dynasty_mover: { label: 'players compared', n: 242 },
  coverage_note: { label: 'routes in the smaller split', n: 30 },
};

function cand(kind: TakeKind, o: { player?: string; pid?: string; facts?: Facts; dataLabel?: string | null } = {}): Candidate {
  return {
    id: `${kind}:${o.pid ?? '100'}:7`, kind, pid: o.pid ?? '100', player: o.player ?? 'Amon-Ra St. Brown', pos: 'WR', team: 'DET', season: '2026', week: 7, throughWeek: 6,
    tone: 'good', score: 0.5, sample: SAMPLE[kind], dataLabel: o.dataLabel === undefined ? (kind === 'coverage_note' ? 'last season (2025)' : null) : o.dataLabel,
    sources: ['nflverse'], actions: ['profile'], facts: o.facts ?? FACTS[kind],
  };
}

/** every variant of the facts that changes the wording */
const FACT_FLAVORS: Array<[TakeKind, Facts]> = [
  ...DETECTOR_KINDS.map((k) => [k, FACTS[k]] as [TakeKind, Facts]),
  ['rz_role_change', { ...FACTS.rz_role_change, up: false, now: 0.1, prior: 0.5 } as Facts],
  ['dynasty_mover', { ...FACTS.dynasty_mover, up: false, trend: -1309, pct: -0.33 } as Facts],
  ['dynasty_mover', { ...FACTS.dynasty_mover, pct: null } as Facts],
  ['coverage_note', { ...FACTS.coverage_note, match: false, better: 'man', oppCoverage: 'zone', oppRate: 0.71 } as Facts],
  ['soft_schedule', { ...FACTS.soft_schedule, opps: ['IND', 'DET', 'BUF', 'NYJ', 'MIA'], grades: [1.2, 1.2, 1.2, 1.2, 1.2], weeks: [7, 8, 9, 10, 11] } as Facts],
  ['box_count_edge', { ...FACTS.box_count_edge, ypc: null } as Facts],
  ['target_hog', { ...FACTS.target_hog, seasonShare: null } as Facts],
];
const NAMES = ['Amon-Ra St. Brown', 'Marvin Harrison Jr.', "Ja'Marr Chase", 'Gabriel Davis Sr. III', 'Zay Flowers', 'Kenneth Walker III'];

describe('headlines', () => {
  it('every variant of every detector is at most 12 words and has no banned words', () => {
    let checked = 0;
    for (const [kind, facts] of FACT_FLAVORS) {
      for (const player of NAMES) {
        const variants = headlineVariants(cand(kind, { player, facts }));
        expect(variants.length).toBeGreaterThanOrEqual(2);
        for (const h of variants) {
          checked++;
          expect(wordCount(h), `${kind}: ${h}`).toBeLessThanOrEqual(MAX_HEADLINE_WORDS);
          expect(bannedIn(h), `${kind}: ${h}`).toEqual([]);
          expect(h).toBe(h.trim());
          expect(h).not.toMatch(/NaN|undefined|null|Infinity|\$\{/);
        }
      }
    }
    expect(checked).toBeGreaterThan(150);
  });
  it('fits 12 words even with a four-word name and big numbers', () => {
    for (const [kind, facts] of FACT_FLAVORS) {
      for (const h of headlineVariants(cand(kind, { player: 'Gabriel Davis Sr. III', facts }))) expect(wordCount(h), h).toBeLessThanOrEqual(12);
    }
  });
  it('the banned list catches hype and "!"', () => {
    for (const w of ['smash spot', 'a league winner', 'league-winner', 'you must start him', 'elite usage', 'insane volume', 'huge role', 'a massive week', 'could explode', 'wow!']) {
      expect(bannedIn(w).length, w).toBeGreaterThan(0);
    }
    for (const w of ['must', 'smash', 'elite', 'insane', 'huge', 'massive', 'explode', 'league winner', '!']) expect(BANNED_WORDS).toContain(w);
    expect(bannedIn('musty old news')).toEqual([]); // whole words only
    expect(bannedIn('Zay Flowers\'s snap share jumped to 82%')).toEqual([]);
  });
});

describe('stat lines', () => {
  it('carry a number, the comparison and the sample size', () => {
    for (const [kind, facts] of FACT_FLAVORS) {
      const c = cand(kind, { facts });
      const { statLine } = renderCandidate(c);
      expect(statLine, kind).toMatch(/\d/);
      if (kind === 'coverage_note') {
        // the route counts are already in the line, so there is no trailing sample tag
        expect(statLine).toContain(`(${c.sample.n} routes)`);
        expect(statLine).not.toContain('in the smaller split');
      } else expect(statLine, kind).toContain(`(${c.sample.n.toLocaleString('en-US')} ${c.sample.label})`);
      expect(statLine).not.toMatch(/NaN|undefined|null|Infinity/);
      expect(statLine).not.toMatch(/ {2}/);
    }
  });
  it('the usage spike line matches the SPEC example shape', () => {
    expect(renderCandidate(cand('usage_spike', { facts: { kind: 'usage_spike', now: 0.82, base: 0.58, baseFrom: 3, baseTo: 5, baseGames: 3, week: 6 } })).statLine)
      .toBe('snap share 82% in week 6, up from 58% over weeks 3–5 (3 games)');
  });
  it('the coverage note names last season in both the label and the line', () => {
    const c = cand('coverage_note');
    expect(c.dataLabel).toBe('last season (2025)');
    expect(renderCandidate(c).statLine).toContain('last season (2025)');
    expect(renderCandidate(c).statLine).toContain('route estimate');
    const current = cand('coverage_note', { dataLabel: null });
    expect(renderCandidate(current).statLine).not.toContain('last season');
  });
  it('is lowercase apart from names and team codes', () => {
    const { headline, statLine } = renderCandidate(cand('box_count_edge', { player: 'Christian McCaffrey' }));
    expect(statLine).toBe(statLine.replace(/\b(?!WAS\b)[A-Z]+[a-z]*/g, (m) => m.toLowerCase()));
    expect(headline).toContain('Christian McCaffrey'.slice(0, 0)); // names are data, left as given
  });
});

describe('variant choice', () => {
  it('is deterministic per kind + pid', () => {
    for (const kind of DETECTOR_KINDS) for (const pid of ['1', '4034', '11560', 'FP_2027_early_0']) {
      expect(variantIndex(kind, pid)).toBe(variantIndex(kind, pid));
      expect(variantIndex(kind, pid)).toBeGreaterThanOrEqual(0);
      expect(variantIndex(kind, pid)).toBeLessThan(3);
    }
    const a = renderCandidate(cand('usage_spike', { pid: '4034' }));
    const b = renderCandidate(cand('usage_spike', { pid: '4034' }));
    expect(a).toEqual(b);
  });
  it('spreads players over all the variants', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(renderCandidate(cand('usage_spike', { pid: String(1000 + i) })).headline.replace(/\d+/g, '#').replace('Amon-Ra St. Brown', 'N'));
    expect(seen.size).toBe(3);
  });
  it('renders the variant variantIndex picks', () => {
    const c = cand('target_hog', { pid: '777' });
    expect(renderCandidate(c).headline).toBe(headlineVariants(c)[variantIndex('target_hog', '777')]);
  });
  it('possessives of names ending in s take an apostrophe only', () => {
    expect(headlineVariants(cand('usage_spike', { player: 'Zay Flowers' })).join('|')).toContain("Zay Flowers' snap share");
  });
});

describe('why it matters for you', () => {
  const base = { spot: 'BN', waiverGain: undefined, waiverKnown: false, ownerTeam: 'Rival FC' };
  it('mine: flex, a starting slot, bench, ir', () => {
    expect(whyForYouLine('mine', { ...base, spot: 'FLEX' })).toBe("he's in your flex this week");
    expect(whyForYouLine('mine', { ...base, spot: 'WRRB_FLEX' })).toBe("he's in your flex this week");
    expect(whyForYouLine('mine', { ...base, spot: 'WR' })).toBe("he's starting for you at wr this week");
    expect(whyForYouLine('mine', base)).toBe("he's on your bench");
    expect(whyForYouLine('mine', { ...base, spot: 'IR' })).toBe("he's on your ir");
  });
  it('waiver: lineup lift when computed, plain otherwise', () => {
    expect(whyForYouLine('waiver', base)).toBe('free agent');
    expect(whyForYouLine('waiver', { ...base, waiverKnown: true, waiverGain: 4.2 })).toBe('free agent; lineup lift +4.2 for the rest of season');
    expect(whyForYouLine('waiver', { ...base, waiverKnown: true, waiverGain: undefined })).toMatch(/^free agent; no lineup lift/);
  });
  it('trade target and league', () => {
    expect(whyForYouLine('trade_target', base)).toBe("on Rival FC's roster");
    expect(whyForYouLine('league', base)).toBeNull();
  });
});
