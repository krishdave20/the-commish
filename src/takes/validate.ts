/* A runtime check of the Take contract (src/takes/types.ts), for tests and for the UI to assert in development. */
import { MAX_HEADLINE_WORDS, bannedIn, wordCount } from './templates.ts';

const KINDS = ['usage_spike', 'target_hog', 'buy_low', 'sell_high', 'rz_role_change', 'box_count_edge', 'blitz_beater', 'soft_schedule', 'waiver_riser', 'dynasty_mover', 'coverage_note'];
const RELEVANCE = ['mine', 'waiver', 'trade_target', 'league'];
const TONES = ['good', 'bad', 'watch'];
const ACTIONS = ['profile', 'watchlist', 'lab', 'trade'];
const SOURCES = ['sleeper', 'nflverse', 'ftn', 'fantasycalc'];
const BAD = /\b(NaN|undefined|null|Infinity)\b/;

/** Problems with one take; an empty list means it satisfies the contract. */
export function validateTake(t: unknown): string[] {
  const errs: string[] = [];
  if (typeof t !== 'object' || t === null) return ['not an object'];
  const x = t as Record<string, unknown>;
  const str = (k: string, nullable = false) => {
    if (x[k] === null && nullable) return;
    if (typeof x[k] !== 'string' || (x[k] as string).length === 0) errs.push(`${k} must be a non-empty string`);
    else if (BAD.test(x[k] as string)) errs.push(`${k} contains NaN/undefined`);
  };
  for (const k of ['id', 'pid', 'player', 'pos', 'season', 'headline', 'statLine']) str(k);
  str('team', true); str('whyForYou', true); str('dataLabel', true);
  if (x.trackRecord !== undefined) str('trackRecord', true);
  if (!KINDS.includes(x.kind as string)) errs.push('bad kind');
  if (!RELEVANCE.includes(x.relevance as string)) errs.push('bad relevance');
  if (!TONES.includes(x.tone as string)) errs.push('bad tone');
  for (const k of ['week', 'throughWeek']) if (!Number.isInteger(x[k])) errs.push(`${k} must be an integer`);
  if (typeof x.score !== 'number' || !(x.score >= 0 && x.score <= 1)) errs.push('score must be in 0..1');
  const s = x.sample as Record<string, unknown> | undefined;
  if (!s || typeof s.label !== 'string' || typeof s.n !== 'number' || !Number.isFinite(s.n) || s.n < 1) errs.push('bad sample');
  if (!Array.isArray(x.sources) || !x.sources.length || !x.sources.every((v) => SOURCES.includes(v as string))) errs.push('bad sources');
  if (!Array.isArray(x.actions) || !x.actions.length || !x.actions.every((v) => ACTIONS.includes(v as string))) errs.push('bad actions');
  if (typeof x.id === 'string' && typeof x.kind === 'string' && x.id !== `${x.kind}:${x.pid}:${x.week}`) errs.push('id must be kind:pid:week');
  if (typeof x.headline === 'string') {
    if (wordCount(x.headline) > MAX_HEADLINE_WORDS) errs.push('headline over 12 words');
    if (bannedIn(x.headline).length) errs.push(`headline has banned words: ${bannedIn(x.headline).join(', ')}`);
  }
  if (typeof x.statLine === 'string' && !/\d/.test(x.statLine)) errs.push('statLine has no number');
  return errs;
}
