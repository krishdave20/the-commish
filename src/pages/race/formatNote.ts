import type { ModelMeta } from '../../engine';

const word = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;

/** One sentence on how the league picks its playoff teams. */
export function formatNote(meta: Pick<ModelMeta, 'playoffTeams' | 'divisions'>): string {
  const wild = meta.playoffTeams - meta.divisions;
  return meta.divisions
    ? `${word(meta.playoffTeams, 'team makes', 'teams make')} it: ${word(meta.divisions, 'division winner', 'division winners')}, then ${word(wild, 'wildcard', 'wildcards')} by record, points for breaking ties.`
    : `the top ${word(meta.playoffTeams, 'team', 'teams')} by record make it, points for breaking ties.`;
}
