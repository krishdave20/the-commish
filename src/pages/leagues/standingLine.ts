import { ordinal } from '../../app/format';
import type { LeagueSummary } from '../../engine/almanac';

/** "in a playoff spot, 2 wins clear" / "2 wins behind the playoff line": the standings stand in for playoff odds on every league but the one with a model. */
export function standingLine(s: NonNullable<LeagueSummary['standing']>): string {
  const wins = (n: number) => `${n % 1 ? n.toFixed(1) : n} ${n === 1 ? 'win' : 'wins'}`;
  if (s.playoffTeams === 0) return `${ordinal(s.rank)} of ${s.of}`;
  if (s.inPlayoffs) return s.winsFromLine === 0 ? 'in a playoff spot, level with the line' : `in a playoff spot, ${wins(s.winsFromLine)} clear`;
  return s.winsFromLine === 0 ? 'on the playoff line' : `${wins(s.winsFromLine)} behind the playoff line`;
}
