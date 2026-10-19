/* What the draft-grades tab needs: the league's real draft graded against today's rankings, scores and rosters.
   It waits for the engine model (points so far, rest of season, rosters) and for a finished draft. */
import { useMemo } from 'react';
import { useModel } from '../../../app/modelContext';
import { makeScorer } from '../../../engine';
import type { DraftMode } from '../../../engine';
import { gradeDraft, playerPerformance } from '../../../engine/draft/grades.ts';
import type { DraftGrades } from '../../../engine/draft/grades.ts';
import type { DraftRoom } from '../model';

export type GradesView =
  | { kind: 'loading'; error: string | undefined }
  /** the draft has not finished (or has no picks to grade) */
  | { kind: 'unfinished'; status: string; picks: number }
  /** the rankings on screen are for another draft mode than the league's draft */
  | { kind: 'mode'; draftMode: DraftMode }
  | { kind: 'ready'; grades: DraftGrades };

export function useGradesView(room: DraftRoom): GradesView {
  const { model, extras, loading, error } = useModel();
  const { draft, inputs, rankings, mode, draftMode } = room;
  const picks = inputs.picks;
  const finished = draft?.status === 'complete' && picks.length > 0;

  const grades = useMemo(() => {
    if (!model || !finished || mode !== draftMode) return null;
    const rosters: Record<number, string[]> = {};
    for (const t of model.teams) rosters[t.rid] = [];
    for (const p of model.players) if (p.ownerRid > 0) (rosters[p.ownerRid] ??= []).push(p.pid);
    const performance = playerPerformance(
      picks.map((p) => p.player_id), model,
      extras ? { stats: extras.stats, score: makeScorer(extras.scoring) } : null,
    );
    // replacement level is read from everyone the model tracks (rostered players and the free-agent pool), like the rankings' VOR
    const field = playerPerformance(model.players.map((p) => p.pid), model);
    const pool = model.players.map((p) => ({ pos: p.pos, total: (field[p.pid]?.toDate ?? 0) + (field[p.pid]?.ros ?? 0) }));
    return gradeDraft({ rankings, picks, performance, rosters, pool, rosterIds: model.teams.map((t) => t.rid) });
  }, [model, extras, finished, mode, draftMode, rankings, picks]);

  if (!finished) return { kind: 'unfinished', status: draft?.status ?? 'none', picks: picks.length };
  if (mode !== draftMode) return { kind: 'mode', draftMode };
  if (!model || !grades) return { kind: 'loading', error: loading ? undefined : error };
  return { kind: 'ready', grades };
}
