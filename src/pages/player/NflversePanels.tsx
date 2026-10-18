import { SectionHeader } from '../../components/SectionHeader';
import type { PlayerNflverse } from './nflversePlayer';
import { CoveragePanel, FtnSplits, RbSplits, SeasonUsage, UsageTrends } from './UsagePanels';

interface Props {
  /** "usage": the trend chart and season usage; "splits": rushing, charting and coverage splits; "all" (default): both */
  part?: 'usage' | 'splits' | 'all';
  pos: string;
  /** null until the nightly files are available */
  data: PlayerNflverse | null;
  loading: boolean;
}

/** The nflverse panels on a player's profile. With no data they say so, once. */
export function NflversePanels({ part = 'all', pos, data, loading }: Props) {
  const empty = !data || (data.weeks.length === 0 && !data.season && !data.coverage?.row);
  if (empty) {
    return (
      <section className="card" aria-labelledby="usage-title">
        <SectionHeader id="usage-title" title={part === 'splits' ? 'splits' : 'usage'} tip="play-by-play, snaps and charting, from nflverse." />
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
      {part !== 'splits' && data.weeks.length > 0 && <UsageTrends weeks={data.weeks} pos={pos} />}
      {part !== 'splits' && data.season && <SeasonUsage s={data.season} defs={defs} />}
      {part !== 'usage' && data.season && pos === 'RB' && <RbSplits s={data.season} />}
      {part !== 'usage' && data.season && <FtnSplits s={data.season} />}
      {part !== 'usage' && data.coverage && <CoveragePanel cov={data.coverage} />}
    </>
  );
}
