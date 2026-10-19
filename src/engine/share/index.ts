/* Share cards: pure builders from plain data to an SVG string (1080 x 1350). The browser side (fonts, headshots, canvas, PNG) is in src/components/share. */
import { bracketBody, bracketHeadline } from './cards/bracket.ts';
import { gradeBody } from './cards/grade.ts';
import { huddleBody } from './cards/huddle.ts';
import { matchupBody } from './cards/matchup.ts';
import { takeBody } from './cards/take.ts';
import { frame, lc, makeCtx } from './kit.ts';
import type { BuildOptions, CardPlayer, CardSpec } from './types.ts';

export * from './types.ts';
export { bracketRows, type BracketRows } from './bracketLayout.ts';
export { paletteFor, LIGHT, DARK, type Palette } from './palette.ts';
export { cssFont, estimateMeasure, SANS, SERIF } from './kit.ts';
export { winCaption } from './cards/matchup.ts';
export { bracketHeadline } from './cards/bracket.ts';

/** The SVG text of a card. Pure: the same spec, theme and images give the same string. */
export function buildCardSvg(spec: CardSpec, opts: BuildOptions): string {
  const c = makeCtx(opts);
  switch (spec.kind) {
    case 'matchup': {
      const chip = { label: spec.statusLabel, tone: spec.state === 'live' ? 'green' as const : spec.state === 'final' ? 'ink' as const : 'gold' as const };
      return frame(c, 'matchup', { kicker: `week ${spec.week} · matchup`, chip, foot: spec.footnote ?? '' }, matchupBody(c, spec));
    }
    case 'take':
      return frame(c, 'take', { kicker: `hot take · week ${spec.week}`, chip: { label: spec.toneLabel, tone: spec.tone === 'good' ? 'green' : spec.tone === 'bad' ? 'red' : 'gold' }, foot: spec.dataLabel ?? '' }, takeBody(c, spec));
    case 'bracket':
      return frame(c, 'bracket', {
        kicker: `${spec.title}${spec.weekLabel ? ` · ${spec.weekLabel}` : ''}`,
        chip: spec.champion ? { label: spec.bracketKind === 'toilet' ? 'crowned' : 'champion', tone: spec.bracketKind === 'toilet' ? 'red' : 'gold' } : null,
        foot: '',
      }, bracketBody(c, spec));
    case 'grade':
      return frame(c, 'grade', { kicker: 'draft grades', chip: null, foot: spec.season }, gradeBody(c, spec));
    case 'huddle':
      return frame(c, 'huddle', { kicker: `this week in a sentence${spec.weekLabel ? ` · ${spec.weekLabel}` : ''}`, chip: null, foot: '' }, huddleBody(c, spec));
  }
}

/** Every player a card can show a headshot for (so the browser knows which images to fetch). */
export function cardPlayers(spec: CardSpec): CardPlayer[] {
  switch (spec.kind) {
    case 'matchup': return [...spec.a.performers, ...spec.b.performers].slice(0, 8);
    case 'take': return [spec.player];
    case 'grade': return [spec.best, spec.miss].filter((p): p is NonNullable<typeof p> => p !== null);
    case 'huddle': return [...spec.mine.slice(0, 3), ...spec.theirs.slice(0, 3)];
    case 'bracket': return [];
  }
}

/** A short plain description of the card (the preview's alt text). */
export function cardAlt(spec: CardSpec): string {
  switch (spec.kind) {
    case 'matchup': return lc(`matchup card: ${spec.a.name} ${spec.a.score.toFixed(1)}, ${spec.b.name} ${spec.b.score.toFixed(1)}, ${spec.statusLabel}, week ${spec.week}`);
    case 'take': return lc(`hot take card: ${spec.headline}`);
    case 'bracket': return lc(`${spec.title} bracket card: ${bracketHeadline(spec)}`);
    case 'grade': return lc(`draft grade card: ${spec.team}, draft day ${spec.draftDay}, hindsight ${spec.hindsight}`);
    case 'huddle': return lc(`huddle card: ${spec.sentence}`);
  }
}

/** The name of the saved file: the-commish-matchup-week-7.png */
export function cardFileName(spec: CardSpec): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const part = spec.kind === 'matchup' ? `matchup-week-${spec.week}` : spec.kind === 'take' ? `take-${slug(spec.player.name)}` : spec.kind === 'bracket' ? `bracket-${spec.bracketKind}`
    : spec.kind === 'grade' ? `draft-grade-${slug(spec.team)}` : 'huddle';
  return `the-commish-${part}.png`;
}
