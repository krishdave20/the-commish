/* players.csv helpers shared by the pipeline. */
import { pfrToGsis } from '../../src/data/ids.ts';
import type { PlayersCsvRow } from './rows.ts';

export const pfrToGsisFromCsv = (rows: PlayersCsvRow[]) => pfrToGsis(rows.map((r) => ({ pfr: r.pfr, gsis: r.gsis })));
