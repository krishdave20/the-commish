import { useMemo, useState } from 'react';
import { EnginePage } from '../app/EnginePage';
import { useNflverse } from '../app/nflverseData';
import { TAKE_KIND_LABEL } from '../app/names';
import { useTakes } from '../app/useTakes';
import { Segmented } from '../components/Segmented';
import type { Take, TakeKind } from '../takes/types';
import { TakeCard } from './takes/TakeCard';

type Scope = 'all' | 'mine' | 'waiver' | 'league';
/** Cards drawn at first; a long feed grows by this much each time. */
const PAGE = 30;
const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: 'all', label: 'all' },
  { value: 'mine', label: 'my players' },
  { value: 'waiver', label: 'waiver wire' },
  { value: 'league', label: 'league-wide' },
];

/** Trade targets sit with league-wide: they are other managers' players. */
const inScope = (t: Take, scope: Scope) =>
  scope === 'all' || (scope === 'league' ? t.relevance === 'league' || t.relevance === 'trade_target' : t.relevance === scope);

function Feed() {
  const t = useTakes();
  const [scope, setScope] = useState<Scope>('all');
  const [kind, setKind] = useState<TakeKind | 'all'>('all');
  const [limit, setLimit] = useState(PAGE);

  const kinds = useMemo(() => {
    const n = new Map<TakeKind, number>();
    for (const x of t.takes) n.set(x.kind, (n.get(x.kind) ?? 0) + 1);
    return [...n.entries()];
  }, [t.takes]);
  const shown = useMemo(
    () => t.takes.filter((x) => inScope(x, scope) && (kind === 'all' || x.kind === kind)),
    [t.takes, scope, kind],
  );
  const usesFc = t.takes.some((x) => x.sources.includes('fantasycalc'));

  return (
    <>
      <section className="card take-filters" aria-labelledby="feed-controls">
        <header>
          <div className="micro">
            {t.throughWeek !== null ? `data through week ${t.throughWeek}` : t.nflverseLoading ? 'loading the nightly nflverse data' : 'no nflverse data yet'}
            {` · ${t.takes.length} ${t.takes.length === 1 ? 'take' : 'takes'}`}
          </div>
          <h2 id="feed-controls">the feed</h2>
        </header>
        <div className="row">
          <Segmented label="Take scope" value={scope} onChange={(v) => { setScope(v); setLimit(PAGE); }} options={SCOPES} />
          <label className="ctl">
            detector
            <select value={kind} onChange={(e) => { setKind(e.target.value as TakeKind | 'all'); setLimit(PAGE); }} aria-label="Detector kind">
              <option value="all">all detectors</option>
              {kinds.map(([k, n]) => <option key={k} value={k}>{TAKE_KIND_LABEL[k]} ({n})</option>)}
            </select>
          </label>
        </div>
        {!t.usesNflverse && !t.nflverseLoading && (
          <p className="note" role="status">the nightly nflverse update has not landed, so usage-based reads are missing. the rest of the feed still runs.</p>
        )}
        {t.error && <p className="note neg-c" role="status">the takes engine hit a snag, so the feed is empty. {t.error}</p>}
      </section>

      {shown.length === 0 ? (
        <p className="empty-take" role="status">
          {t.takes.length === 0 ? 'quiet week. no takes clear the bar.' : 'nothing in this filter. try another.'}
        </p>
      ) : (
        <div className="take-feed" role="list" aria-label="Hot takes">
          {shown.slice(0, limit).map((x) => <div role="listitem" key={x.id} className="take-item"><TakeCard take={x} /></div>)}
        </div>
      )}
      {shown.length > limit && (
        <div className="row">
          <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE)}>show {Math.min(PAGE, shown.length - limit)} more</button>
          <span className="note">showing {limit} of {shown.length}</span>
        </div>
      )}

      <p className="note">
        every take is a template filled with real numbers. no ai wrote them.
        {t.attribution ? ` ${t.attribution}` : ''}{usesFc ? ' Values: FantasyCalc.' : ''}
      </p>
    </>
  );
}

export default function Takes() {
  const nv = useNflverse();
  return (
    <EnginePage page="takes" suffix={(e) => `week ${e.model.meta.currentWeek}`} alsoRefresh={nv.refresh}>
      {() => <Feed />}
    </EnginePage>
  );
}
