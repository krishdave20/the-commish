import { useMemo, useState } from 'react';
import { HeadlineStrip } from '../../../components/HeadlineStrip';
import { Segmented } from '../../../components/Segmented';
import { SectionHeader } from '../../../components/SectionHeader';
import { signed } from '../../../app/format';
import type { Engine } from '../../../engine';
import type { FinderKind, Prefill } from '../../../engine/tradefinder/index.ts';
import type { DynastyView } from '../useDynasty';
import { IdeaCard } from './IdeaCard';
import { FINDER_TAB, KIND_LABEL } from './labels';
import { useFinder, useFinderOdds } from './useFinder';
import './finder.css';

type Filter = 'all' | FinderKind;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'all' }, { value: 'two-for-one', label: KIND_LABEL['two-for-one'] },
  { value: 'one-for-two', label: KIND_LABEL['one-for-two'] }, { value: 'three-team', label: KIND_LABEL['three-team'] },
];

const lc = (s: string | null) => (s ? s.toLowerCase() : 'none');

interface Props {
  engine: Engine;
  /** dynasty mode (null in a redraft league that is not being explored) */
  dyn: DynastyView | null;
  /** put an idea into the analyzer tab */
  onLoad: (p: Prefill) => void;
}

/** Need-driven ideas: what your lineup is missing, what you have spare, and the deals (2-for-1, 1-for-2, three-team) that fix it. */
export function FinderTab({ engine, dyn, onLoad }: Props) {
  const result = useFinder(engine, dyn);
  const [filter, setFilter] = useState<Filter>('all');
  const [balanced, setBalanced] = useState(false);
  const { ideas } = result;
  const anyLopsided = ideas.some((i) => i.lopsided);
  const shown = useMemo(
    () => ideas.filter((i) => (filter === 'all' || i.kind === filter) && !(balanced && i.lopsided)).sort((a, b) => b.minGain - a.minGain),
    [ideas, filter, balanced],
  );
  const odds = useFinderOdds(engine, ideas);
  const count = (k: FinderKind) => ideas.filter((i) => i.kind === k).length;
  const best = [...ideas].sort((a, b) => b.minGain - a.minGain)[0];

  return (
    <>
      <HeadlineStrip
        label="your trade needs"
        items={[
          { label: 'biggest need', value: lc(result.need), sub: result.needTier ? `${result.needTier} tier` : undefined },
          { label: 'biggest surplus', value: lc(result.surplus), sub: result.surplus ? `${result.surplusTier ?? ''} tier` : result.usedBench ? 'using bench players' : 'no spare depth' },
          { label: 'ideas found', value: ideas.length, sub: `2-for-1: ${count('two-for-one')} · 1-for-2: ${count('one-for-two')} · 3-team: ${count('three-team')}` },
          { label: 'best deal for you', value: best ? `${signed(best.sides[0]!.perWeek)}` : '—', sub: best ? 'points a week, both sides gain' : undefined },
        ]}
      />
      <section className="card" aria-labelledby="finder-title">
        <SectionHeader
          id="finder-title" title={FINDER_TAB}
          tip="sends your spare position and brings back the one your lineup lacks. gains are best-lineup points over the rest of the regular season plus the playoff weeks. a 2-for-1 needs the other team to lose nothing; a three-team rotation needs all three lineups to gain. ranked by the smallest gain, so a lopsided deal ranks low. a side over the roster limit drops its cheapest bench player, shown on the idea."
        />
        <div className="form-row ffilters">
          <Segmented label="Deal type" options={FILTERS} value={filter} onChange={setFilter} />
          {anyLopsided && (
            <label className="ctl ftoggle">
              <input type="checkbox" checked={balanced} onChange={(e) => setBalanced(e.target.checked)} />
              hide lopsided offers
            </label>
          )}
        </div>
        {dyn && !dyn.fc && <p className="note" role="status">loading dynasty values…</p>}
        {dyn?.fc && !dyn.fc.ok && <p className="note" role="status">dynasty values are unavailable right now, so offers are not checked for balance. {dyn.fc.reason}</p>}
        {ideas.length === 0 ? (
          <p className="note" role="status">{result.reason || 'no ideas yet.'}</p>
        ) : shown.length === 0 ? (
          <p className="note" role="status">{balanced ? 'every idea here is lopsided on value. show them to see them.' : `no ${filter === 'all' ? '' : `${KIND_LABEL[filter]} `}deals found where every side gains.`}</p>
        ) : (
          <ol className="finder-list" aria-label="trade ideas, best first">
            {shown.map((i) => (
              <IdeaCard key={i.id} idea={i} onLoad={onLoad} odds={odds.ids.includes(i.id) ? odds.byId[i.id] ?? null : undefined} />
            ))}
          </ol>
        )}
        <p className="note">
          roster limit {result.rosterSize}. {result.evaluated.toLocaleString('en-US')} deals scored in {Math.max(1, Math.round(result.ms))} ms. playoff odds are simulated for the top {odds.ids.length || 5} only.
        </p>
      </section>
    </>
  );
}
