import { detectPhase } from '../data';
import type { NflState, Phase, SleeperDraft, SleeperLeague } from '../data';

/* detectPhase is a hand-written function the owner has not finished yet. Until then it throws,
   and the UI shows "not set yet" instead of crashing. */
export function safeDetectPhase(state: NflState, league: SleeperLeague, draft: SleeperDraft | null): Phase | null {
  try {
    return detectPhase(state, league, draft);
  } catch {
    return null;
  }
}

const LABELS: Record<Phase, string> = {
  offseason: 'Offseason',
  pre_draft: 'Pre-draft',
  drafting: 'Draft day',
  in_season: 'In season',
  postseason: 'Postseason',
};

export function phaseLabel(phase: Phase | null): string {
  return phase ? LABELS[phase] : 'not set yet';
}

/** The league's current draft: the one named by `draft_id`, else the first. */
export function currentDraft(league: SleeperLeague, drafts: SleeperDraft[]): SleeperDraft | null {
  return drafts.find((d) => d.draft_id === league.draft_id) ?? drafts[0] ?? null;
}
