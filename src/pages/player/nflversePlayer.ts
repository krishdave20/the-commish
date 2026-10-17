import type { CoverageRow, CoverageTuple, NflverseManifest, PlayerSeason, PlayerWeek } from '../../data/nflverseTypes';

/** Everything the nflverse panels show for one player. */
export interface PlayerNflverse {
  manifest: NflverseManifest;
  /** his weekly rows this season, by week */
  weeks: PlayerWeek[];
  season: PlayerSeason | null;
  coverage: {
    row: CoverageRow | null;
    /** coverage shell -> [routes, targets, receptions, yards, td] */
    shells: Record<string, CoverageTuple> | null;
    season: number;
    isCurrent: boolean;
    routesDefinition: string;
  } | null;
}
