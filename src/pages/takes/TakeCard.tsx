import { Link } from 'react-router-dom';
import { TAKE_KIND_LABEL } from '../../app/names';
import { useTryInLab } from '../../app/tryInLab';
import { useWatchlist } from '../../app/useWatchlist';
import { Disclosure } from '../../components/Disclosure';
import type { Take } from '../../takes/types';

const SOURCE_LABEL: Record<Take['sources'][number], string> = {
  sleeper: 'sleeper', nflverse: 'nflverse', ftn: 'ftn data via nflverse', fantasycalc: 'fantasycalc',
};
const RELEVANCE_LABEL: Record<Take['relevance'], string> = {
  mine: 'your player', waiver: 'waiver wire', trade_target: 'trade target', league: 'league-wide',
};
const TONE_LABEL: Record<Take['tone'], string> = { good: 'good news', bad: 'risk', watch: 'watch' };

interface Props {
  take: Take;
  /** on a player's own page the name is already in the header */
  compact?: boolean;
  /** the huddle's version: the stat line moves in with the detail, so the card is a headline and one tap */
  lean?: boolean;
}

/** One hot take, compact: a quiet meta line, the headline (serif) and the numbers (the stat line). "why it matters", the track record
    and the sources sit behind one "the detail" disclosure; the actions stay one click away at the foot.
    Copy comes straight from the engine's templates; this card never writes any of it. */
export function TakeCard({ take, compact = false, lean = false }: Props) {
  const watch = useWatchlist();
  const tryIt = useTryInLab();
  const watching = watch.has(take.pid);
  // optional on the engine's Take: how this kind of take did in last season's backtest
  const trackRecord = take.trackRecord ?? null;
  const has = (a: Take['actions'][number]) => take.actions.includes(a);
  const actions = (
    <div className="take-actions row">
      {!compact && (
        <Link className="btn quiet" to={`/players/${encodeURIComponent(take.pid)}`} aria-label={`profile: ${take.player}`}>profile</Link>
      )}
      {has('watchlist') && (
        <button type="button" className="tog" aria-pressed={watching}
          aria-label={`${watching ? 'watching' : 'watch'} ${take.player}`}
          onClick={() => watch.toggle(take.pid)}>{watching ? 'watching' : 'watch'}</button>
      )}
      {has('lab') && (
        <button type="button" className="btn" aria-label={`try in the lab: ${take.player}`} title="see it in the what-if lab" onClick={() => tryIt(take)}>try in the lab</button>
      )}
      {has('trade') && (
        <Link className="btn quiet" to={`/trades?player=${encodeURIComponent(take.pid)}`} aria-label={`trade block: ${take.player}`}>trade block</Link>
      )}
    </div>
  );
  return (
    <article className="take-card" data-tone={take.tone} aria-label={`Take: ${take.headline}`}>
      <div className="take-meta micro">
        <span className={`take-tone ${take.tone}`}>{TONE_LABEL[take.tone]}</span>
        <span>{TAKE_KIND_LABEL[take.kind]}</span>
        {!compact && <span>{take.pos}{take.team ? ` · ${take.team}` : ''}</span>}
        {!compact && take.relevance !== 'mine' && <span>{RELEVANCE_LABEL[take.relevance]}</span>}
      </div>
      <h3 className="take-head">{take.headline}</h3>
      {!lean && <p className="take-stat">{take.statLine}</p>}
      <Disclosure title="the detail" level={3} inline>
        {lean && <p className="take-stat">{take.statLine}</p>}
        {take.whyForYou && <p className="take-why"><span className="micro">why it matters for you</span><br />{take.whyForYou}</p>}
        {trackRecord && <p className="take-track">{trackRecord}</p>}
        <div className="take-foot">
          {take.dataLabel && <span className="chip gold" title="where this number comes from">{take.dataLabel}</span>}
          <span className="dim">week {take.week}</span>
          <span className="dim">sample: {take.sample.n} {take.sample.label}</span>
          <span className="dim">sources: {take.sources.map((s) => SOURCE_LABEL[s]).join(', ')}</span>
        </div>
        {lean && actions}
      </Disclosure>
      {!lean && actions}
    </article>
  );
}
