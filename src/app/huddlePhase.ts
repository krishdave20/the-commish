import type { Phase } from '../data';

/** The layouts the huddle can force with `#/?phase=offseason` (review aid). */
export const PREVIEW_PHASES: readonly Phase[] = ['offseason', 'pre_draft', 'drafting', 'in_season', 'postseason'];

/** A `phase` query value, or null when it is missing or not one of the five. Accepts `pre-draft` as well as `pre_draft`. */
export function parsePreviewPhase(value: string | null): Phase | null {
  const v = (value ?? '').trim().toLowerCase().replace(/-/g, '_');
  return (PREVIEW_PHASES as readonly string[]).includes(v) ? (v as Phase) : null;
}

/** "pre-draft", "draft day": the phase in words for the preview note. */
export function previewName(phase: Phase): string {
  return ({ offseason: 'offseason', pre_draft: 'pre-draft', drafting: 'draft day', in_season: 'in season', postseason: 'postseason' } satisfies Record<Phase, string>)[phase];
}
