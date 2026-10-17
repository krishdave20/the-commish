import type { PlayerNflverse } from './nflversePlayer';
import { CoveragePanel, FtnSplits, RbSplits, SeasonUsage, UsageTrends } from './UsagePanels';

interface Props {
  pos: string;
  /** null until the nightly files are available */
  data: PlayerNflverse | null;
  loading: boolean;
}

/** The nflverse panels on a player's profile. With no data they say so, once. */
export function NflversePanels({ pos, data, loading }: Props) {
  const empty = !data || (data.weeks.length === 0 && !data.season && !data.coverage?.row);
  if (empty) {
    return (
      <section className="card" aria-labelledby="usage-title">
        <header><div className="micro">play-by-play, snaps and charting</div><h2 id="usage-title">usage</h2></header>
        <p className="note" role="status">
          {loading ? 'loading the nightly nflverse data…'
            : data ? 'no nflverse usage on file for this player yet.' : 'nflverse data arrives with the nightly update.'}
        </p>
      </section>
    );
  }
  const defs = data.manifest.definitions;
  return (
    <>
      {data.weeks.length > 0 && <UsageTrends weeks={data.weeks} pos={pos} />}
      {data.season && <SeasonUsage s={data.season} defs={defs} />}
      {data.season && pos === 'RB' && <RbSplits s={data.season} />}
      {data.season && <FtnSplits s={data.season} />}
      {data.coverage && <CoveragePanel cov={data.coverage} />}
    </>
  );
}
