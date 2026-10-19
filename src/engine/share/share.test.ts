/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARD_H, CARD_W, DARK, LIGHT, bracketRows, bracketHeadline, buildCardSvg, cardAlt, cardFileName, cardPlayers, estimateMeasure,
} from './index.ts';
import type { BracketCardData, BracketCardMatch, CardSpec, GradeCardData, HuddleCardData, MatchupCardData, TakeCardData } from './index.ts';
import { fitLine, wrap } from './kit.ts';
import { buildBracket } from '../bracket/index.ts';

const IMG = 'data:image/png;base64,iVBORw0KGgo=';

const matchup: MatchupCardData = {
  kind: 'matchup', week: 7, statusLabel: 'live', state: 'live', projected: false, winA: 0.82, preWinA: 0.55, headline: 'icemen leads killa k im gay by 32.8',
  a: { name: 'Icemen', score: 102, isMe: true, sub: 'projected 118.4 · 2 left', performers: [{ pid: '6794', name: 'Justin Jefferson', pos: 'WR', team: 'MIN', points: 28.4 }, { pid: '4034', name: 'Christian McCaffrey', pos: 'RB', team: 'SF', points: 22.1 }] },
  b: { name: 'Killa K IM Gay', score: 69.2, isMe: false, sub: 'projected 96.0 · 4 left', performers: [{ pid: 'KC', name: 'Kansas City', pos: 'DEF', team: 'KC', points: 12 }] },
  footnote: '6 starters left',
};
const take: TakeCardData = {
  kind: 'take', headline: 'CeeDee Lamb’s target share jumped 11 points', statLine: 'targets per route run 0.31 over 3 games vs 0.22 before', tone: 'good', toneLabel: 'good news', kindLabel: 'usage spike',
  week: 8, player: { pid: '6786', name: 'CeeDee Lamb', pos: 'WR', team: 'DAL' }, trackRecord: 'usage spikes held up in 64% of cases last season', dataLabel: 'last season (2025)',
};
const grade: GradeCardData = {
  kind: 'grade', team: 'Icemen', isMe: true, draftDay: 'B+', hindsight: 'A−', rank: 2, teamCount: 12, rankChange: 4, season: '2026 season',
  best: { pid: '7564', name: 'Ja’Marr Chase', pos: 'WR', team: 'CIN', line: 'wr · pick 14', delta: '+38 pts vs expected' },
  miss: { pid: '4881', name: 'Lamar Jackson', pos: 'QB', team: 'BAL', line: 'qb · pick 3', delta: '−52 pts vs expected' },
};
const huddle: HuddleCardData = {
  kind: 'huddle', sentence: 'icemen leads killa k im gay 102.0 to 69.2.', odds: 'you win 82 of every 100 simulations from here', winMe: 0.82, meName: 'icemen', oppName: 'killa k im gay', weekLabel: 'week 7',
  mine: [{ pid: '6794', name: 'Justin Jefferson', pos: 'WR', team: 'MIN' }], theirs: [{ pid: '4046', name: 'Patrick Mahomes', pos: 'QB', team: 'KC' }],
};

function bracketData(champion: string | null, kind: BracketCardData['bracketKind'] = 'championship'): BracketCardData {
  const slot = (rid: number, name: string, seed: number, advances: boolean, isMe = false) => ({ rid, name, seed, bye: false, advances, isMe });
  const m = (id: string, round: number, cy: number, a: BracketCardMatch['a'], b: BracketCardMatch['b'], feeds: BracketCardMatch['feeds']): BracketCardMatch => ({ id, round, cy, a, b, locked: false, feeds });
  return {
    kind: 'bracket', bracketKind: kind, title: kind === 'toilet' ? 'the toilet bowl' : 'road to the ’ship', champLabel: kind === 'toilet' ? 'toilet bowl champ' : 'league champ',
    champLine: kind === 'toilet' ? 'crowned the worst team in the league' : 'wins the whole thing', rounds: 2, roundLabels: ['semifinals', 'final'], layoutHeight: 4,
    champion, championIsMe: false, picks: 3, weekLabel: 'weeks 16 and 17'.replace(' and ', ' to '),
    matches: [
      m('r1m1', 1, 1, slot(1, 'Icemen', 1, true, true), slot(4, 'Dak', 4, false), { to: 'r2m1', slot: 'a' }),
      m('r1m2', 1, 3, slot(2, 'Wire Hero', 2, true), slot(3, 'Brock', 3, false), { to: 'r2m1', slot: 'b' }),
      m('r2m1', 2, 2, slot(1, 'Icemen', 1, true, true), slot(2, 'Wire Hero', 2, false), null),
    ],
  };
}

const ALL: Array<[string, CardSpec]> = [['matchup', matchup], ['take', take], ['bracket', bracketData('Icemen')], ['grade', grade], ['huddle', huddle]];
const light = (s: CardSpec, images = {}) => buildCardSvg(s, { theme: 'light', images });
const dark = (s: CardSpec, images = {}) => buildCardSvg(s, { theme: 'dark', images });
/** the visible words of a card (the text of every <text> element) */
const words = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join(' ');

describe('share cards: the shell', () => {
  it.each(ALL)('%s card is a 1080 x 1350 svg with the wordmark and no web address', (kind, spec) => {
    const svg = light(spec);
    expect(svg).toMatch(new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" data-card="${kind}"`));
    expect(CARD_W / CARD_H).toBeCloseTo(0.8);
    expect(words(svg)).toContain('the commish');
    // nothing to track: the only address in the file is the svg namespace
    expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:|utm_|\?ref=|www\./);
  });

  it('draws all text in lowercase, whatever the data says', () => {
    const w = words(light(matchup));
    expect(w).toContain('icemen');
    expect(w).toContain('killa k im gay');
    expect(w).not.toMatch(/[A-Z]/);
  });

  it('follows the theme: parchment or ink, and the tokens from tokens.css', () => {
    const l = light(matchup), d = dark(matchup);
    expect(l).toContain('data-theme="light"');
    expect(d).toContain('data-theme="dark"');
    expect(l).toContain(`<rect width="${CARD_W}" height="${CARD_H}" fill="${LIGHT.paper}"/>`);
    expect(d).toContain(`<rect width="${CARD_W}" height="${CARD_H}" fill="${DARK.paper}"/>`);
    expect(LIGHT.paper).toBe('#f4f1eb');
    expect(DARK.paper).toBe('#171512');
    expect(l).not.toContain(DARK.paper);
  });

  it('puts the embedded font rules inside the svg when it is given them, and not otherwise', () => {
    const css = "@font-face{font-family:'Instrument Serif';src:url(data:font/woff2;base64,AAAA) format('woff2');}";
    expect(buildCardSvg(take, { theme: 'light', fontCss: css })).toContain(`<defs><style>${css}</style></defs>`);
    expect(light(take)).not.toContain('<style>');
    expect(light(take)).toContain("font-family=\"'Instrument Serif'");
  });

  it('is pure: the same data gives the same svg', () => {
    for (const [, s] of ALL) expect(light(s)).toBe(light(s));
  });

  it('escapes markup in names', () => {
    const svg = light({ ...take, headline: 'a <b> & "c"' });
    expect(svg).toContain('a &lt;b&gt; &amp; &quot;c&quot;');
    expect(svg).not.toContain('<b>');
  });
});

describe('share cards: headshots and the monogram fallback', () => {
  it('uses a CORS-safe image when the card has one for the pid', () => {
    const svg = light(take, { '6786': IMG });
    expect(svg).toContain('data-kind="photo" data-pid="6786"');
    expect(svg).toContain(`<image href="${IMG}"`);
    expect(svg).toContain('clip-path="url(#clip');
    expect(svg).not.toContain('data-kind="monogram"');
  });

  it('falls back to a team-colour monogram when the image is not CORS-safe (no entry for the pid)', () => {
    const svg = light(take, {});
    expect(svg).toContain('data-kind="monogram" data-pid="6786"');
    expect(svg).not.toContain('<image');
    // Dallas blue behind the initials, in the team's own colours, with the readable letter colour
    expect(svg).toContain('fill="#003594"');
    expect(words(svg)).toContain('cl'); // initials in lowercase, like the page's own monograms
  });

  it('never draws a photo for a team defense, even when an image exists for its id', () => {
    const svg = light(matchup, { KC: IMG, '6794': IMG });
    expect(svg).toContain('data-kind="monogram" data-pid="KC"');
    expect(svg).toContain('data-kind="photo" data-pid="6794"');
    expect(words(svg)).toContain('kc');
  });

  it('a player with no team is a neutral circle, not an error', () => {
    const svg = light({ ...take, player: { pid: '1', name: 'Free Agent', pos: 'RB', team: null } });
    expect(svg).toContain('data-kind="monogram" data-pid="1"');
    expect(svg).toContain(`fill="${LIGHT.rule}"`);
  });

  it('lists the players a card can show, so only those images are fetched', () => {
    expect(cardPlayers(matchup).map((p) => p.pid)).toEqual(['6794', '4034', 'KC']);
    expect(cardPlayers(take).map((p) => p.pid)).toEqual(['6786']);
    expect(cardPlayers(grade).map((p) => p.pid)).toEqual(['7564', '4881']);
    expect(cardPlayers(huddle).map((p) => p.pid)).toEqual(['6794', '4046']);
    expect(cardPlayers(bracketData(null))).toEqual([]);
  });
});

describe('matchup card', () => {
  it('has both teams, the big scores, the status, the week and the win chance on the turf field', () => {
    const svg = light(matchup);
    const w = words(svg);
    for (const t of ['week 7 · matchup', 'live', 'icemen', 'you', '102.0', '69.2', 'killa k im gay', 'projected 118.4 · 2 left', '82%', 'win chance', '6 starters left']) expect(w).toContain(t);
    expect(w).toContain('icemen leads killa k im gay by 32.8');
    expect(w).toContain('icemen wins 82 of every 100 simulations from here');
    expect(w).toContain('28.4');
    expect(w).toContain('justin jefferson');
    expect(w).toContain('before kickoff icemen 55%');
    expect(svg).toContain('data-part="turf"');
    // ten stripes, a ball and a gold tick for the pre-kickoff chance
    expect(svg.match(/fill="#2d5a27"|fill="#285022"/g)!.length).toBeGreaterThanOrEqual(10);
    expect(svg).toContain(`stroke="${LIGHT.gold}"`);
  });

  it('puts the ball on the yard that matches the win chance: 82% is the right team\'s 18', () => {
    const at = (p: number) => Number(/translate\(([\d.]+) [\d.]+\) rotate\(-14\)/.exec(light({ ...matchup, winA: p }))![1]);
    expect(at(0.5)).toBeCloseTo(72 + (60 / 120) * 936, 0); // midfield
    expect(at(0.82)).toBeGreaterThan(at(0.5));
    expect(at(0.2)).toBeLessThan(at(0.5));
  });

  it('final: the ball is at the winner\'s goal line, the chip says final and there is no pre-kickoff tick', () => {
    const final: MatchupCardData = { ...matchup, state: 'final', statusLabel: 'final', winA: 1, headline: 'icemen beat killa k im gay by 32.8', footnote: '' };
    const svg = light(final);
    const w = words(svg);
    expect(w).toContain('final');
    expect(w).toContain('icemen won');
    expect(w).not.toContain('before kickoff');
    expect(svg).not.toContain('stroke-dasharray="7 5"');
    expect(svg).toContain(`data-card="matchup"`);
  });

  it('before kickoff the caption says the numbers rest on the projections', () => {
    expect(words(light({ ...matchup, state: 'pre', projected: true, statusLabel: 'projected' }))).toContain('of every 100 simulations on the projections');
  });

  it('a side with no performers says so', () => {
    expect(words(light({ ...matchup, b: { ...matchup.b, performers: [] } }))).toContain('nobody on the board');
  });

  it('keeps a very long team name inside the card (cut with an ellipsis)', () => {
    const svg = light({ ...matchup, a: { ...matchup.a, name: 'the seven-time champion of the long team names league and then some' } });
    expect(words(svg)).toMatch(/…/);
  });
});

describe('hot take card', () => {
  it('has the headline, the stat line, the player, the tone and the track record', () => {
    const w = words(light(take));
    for (const t of ['hot take · week 8', 'good news', 'ceedee lamb’s target share jumped 11 points', 'targets per route run 0.31 over 3 games vs 0.22 before', 'the numbers', 'wr · dal · week 8', 'good news · usage spike', 'track record', 'usage spikes held up in 64% of cases last season', 'last season (2025)']) {
      expect(w).toContain(t);
    }
  });

  it('leaves the track record out when the take has none', () => {
    expect(words(light({ ...take, trackRecord: null }))).not.toContain('track record');
  });

  it('uses the warm red for a risk and gold for a watch', () => {
    expect(light({ ...take, tone: 'bad', toneLabel: 'risk' })).toContain(`fill="${LIGHT.red}"`);
    expect(light({ ...take, tone: 'watch', toneLabel: 'watch' })).toContain(`fill="${LIGHT.goldInk}"`);
  });
});

describe('bracket card', () => {
  it('shows the champion, the rounds, every team with its seed, and marks the picks', () => {
    const svg = light(bracketData('Icemen'));
    const w = words(svg);
    for (const t of ['road to the ’ship · weeks 16 to 17', 'champion', 'league champ', 'semifinals', 'final', 'wins the whole thing', 'wire hero', 'dak', 'brock', 'built from 3 picks']) expect(w).toContain(t);
    expect(svg).toContain('data-match="r1m1"');
    expect(svg).toContain('data-match="r2m1"');
    // the advancing team's box carries the green bar
    expect(svg).toContain(`fill="${LIGHT.green}"`);
  });

  it('toilet bowl: the champion is crowned the worst team in the league', () => {
    const w = words(light(bracketData('Dak', 'toilet')));
    expect(w).toContain('toilet bowl champ');
    expect(w).toContain('crowned the worst team in the league');
    expect(light(bracketData('Dak', 'toilet'))).toContain(`fill="${LIGHT.toilet}"`);
  });

  it('writes the headline for each case', () => {
    expect(bracketHeadline(bracketData('Icemen'))).toBe('icemen takes it all');
    expect(bracketHeadline(bracketData('Dak', 'toilet'))).toBe('dak lost every round');
    expect(bracketHeadline(bracketData(null, 'toilet'))).toBe('who gets crowned the worst?');
  });

  it('with no champion yet it says who is still to be decided', () => {
    const open = { ...bracketData(null), picks: 0 };
    const w = words(light(open));
    expect(w).toContain('who takes it all?');
    expect(w).toContain('to be decided');
    expect(w).toContain('the bracket as it stands');
  });

  it('lays out games halfway between their feeders, byes included', () => {
    const bk = buildBracket({ kind: 'championship', seedOrder: [1, 2, 3, 4, 5, 6, 7, 8], rules: { weekStart: 15, roundType: 0, seedType: 0 } });
    const { cy, rows, feeds } = bracketRows(bk);
    expect(rows).toBe(8);
    expect(cy.r1m1).toBe(1);
    expect(cy.r1m2).toBe(3);
    expect(cy.r2m1).toBe(2);
    expect(cy.r3m1).toBe(4);
    expect(feeds.r1m1).toEqual({ to: 'r2m1', slot: 'a' });
    expect(feeds.r1m2).toEqual({ to: 'r2m1', slot: 'b' });
    expect(feeds.r3m1).toBeUndefined();
    // six teams: the byes enter in round 2 and take a row each
    const six = bracketRows(buildBracket({ kind: 'championship', seedOrder: [1, 2, 3, 4, 5, 6], rules: { weekStart: 15, roundType: 0, seedType: 0 } }));
    expect(six.rows).toBe(6);
  });
});

describe('draft grade card', () => {
  it('shows the team, the big letter, the draft day letter, the rank and both picks', () => {
    const svg = light(grade);
    const w = words(svg);
    for (const t of ['draft grades', 'icemen', 'my draft · 2026 season', 'hindsight', '2nd of 12', 'draft day', 'B+', 'up 4 since draft day', 'best pick', 'biggest miss', 'ja’marr chase', 'wr · pick 14', '+38 pts vs expected', 'lamar jackson', '−52 pts vs expected']) {
      expect(w).toContain(t);
    }
    // the big letter is the hindsight grade: the A is one text, the minus rides beside it as a superscript
    expect(svg).toMatch(/font-size="560"[^>]*>A<tspan[^>]*>−<\/tspan>/);
  });

  it('a draft that dropped says down, and a pick that is missing shows a dash', () => {
    const w = words(light({ ...grade, rankChange: -3, miss: null }));
    expect(w).toContain('down 3 since draft day');
    expect(w).toContain('—');
  });
});

describe('huddle card', () => {
  it('has the sentence, the odds in words and the turf field with the ball on the win chance', () => {
    const svg = light(huddle);
    const w = words(svg);
    expect(w).toContain('icemen leads killa k im gay 102.0 to 69.2.');
    expect(w).toContain('you win 82 of every 100 simulations from here');
    expect(w).toContain('82%');
    expect(w).toContain('this week in a sentence · week 7');
    expect(svg).toContain('data-part="turf"');
  });

  it('draws no field when the live layer does not know the odds', () => {
    const svg = light({ ...huddle, winMe: null, odds: null });
    expect(svg).not.toContain('data-part="turf"');
    expect(words(svg)).not.toContain('simulations');
  });

  it('shrinks a long sentence to fit instead of running off the card', () => {
    const long = light({ ...huddle, sentence: 'the seven-time champion of the long team names league leads the equally long named opponent 102.0 to 69.2.' });
    expect(words(long)).toContain('69.2');
    expect(long).not.toMatch(/font-size="1[3-7]\d"[^>]*>the seven/);
  });
});

describe('text fitting', () => {
  const f = { family: 'sans' as const, size: 20 };
  it('wraps greedily and ends the last line with an ellipsis when words are left over', () => {
    const lines = wrap('one two three four five six seven eight nine ten', f, 120, 2, estimateMeasure);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
    expect(wrap('short', f, 500, 3, estimateMeasure)).toEqual(['short']);
  });
  it('cuts one line to the width', () => {
    const out = fitLine('a very long team name that cannot possibly fit', f, 150, estimateMeasure);
    expect(out.endsWith('…')).toBe(true);
    expect(estimateMeasure(out, f)).toBeLessThanOrEqual(150);
  });
});

describe('names for files and previews', () => {
  it('names the file and describes the preview for each card', () => {
    expect(cardFileName(matchup)).toBe('the-commish-matchup-week-7.png');
    expect(cardFileName(take)).toBe('the-commish-take-ceedee-lamb.png');
    expect(cardFileName(bracketData(null, 'toilet'))).toBe('the-commish-bracket-toilet.png');
    expect(cardFileName(grade)).toBe('the-commish-draft-grade-icemen.png');
    expect(cardFileName(huddle)).toBe('the-commish-huddle.png');
    expect(cardAlt(matchup)).toBe('matchup card: icemen 102.0, killa k im gay 69.2, live, week 7');
    expect(cardAlt(grade)).toContain('draft day b+');
  });
});

describe('palette', () => {
  const tokens = readFileSync(`${process.cwd()}/src/styles/tokens.css`, 'utf8');
  const block = (re: RegExp) => tokens.match(re)![0];
  const light = block(/:root \{[\s\S]*?\n\}/);
  const dark = block(/:root\[data-theme="dark"\] \{[\s\S]*?\n\}/);
  const val = (css: string, name: string) => new RegExp(`--${name}: ([^;]+);`).exec(css)![1]!.replace(/\s+/g, '').replace(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/, 'rgba($1,$2,$3,$4)');
  const pairs: Array<[keyof typeof LIGHT, string]> = [
    ['paper', 'paper'], ['sheet', 'sheet'], ['ink', 'ink'], ['ink2', 'ink-2'], ['ink3', 'ink-3'], ['rule', 'rule'], ['rule2', 'rule-2'], ['green', 'green'], ['greenSoft', 'green-soft'],
    ['red', 'red'], ['redSoft', 'red-soft'], ['gold', 'gold'], ['goldInk', 'gold-ink'], ['goldSoft', 'gold-soft'], ['turf', 'turf'], ['turf2', 'turf-2'], ['turfEdge', 'turf-edge'],
    ['turfEzRed', 'turf-ez-red'], ['turfBall', 'turf-ball'], ['turfBallLine', 'turf-ball-line'], ['inverse', 'surface-inverse'], ['onInverse', 'on-inverse'], ['toilet', 'toilet'], ['toiletEdge', 'toilet-edge'], ['onAccent', 'on-accent'],
  ];
  it.each(pairs)('%s matches the --%s token in both looks', (key, token) => {
    expect(LIGHT[key]).toBe(val(light, token));
    expect(DARK[key]).toBe(val(dark, token));
  });
});
