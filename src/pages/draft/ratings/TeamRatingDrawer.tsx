import { Link } from 'react-router-dom';
import { formatCount, formatPoints1, ordinal, signed } from '../../../app/format';
import { Drawer } from '../../../components/Drawer';
import type { Ratings, TeamRating } from '../../../engine/draft/ratings.ts';
import { TierChip } from './TierChip';
import { groupLabel } from './labels';

interface Props {
  rating: TeamRating | null;
  ratings: Ratings;
  onClose: () => void;
}

/** One team's position breakdown: starters, bench depth and where each group ranks, then what it needs and what it could trade. */
export function TeamRatingDrawer({ rating: r, ratings, onClose }: Props) {
  if (!r) return null;
  const n = ratings.teams.length;
  const need = r.groups.find((g) => g.key === r.need);
  const surplus = r.groups.find((g) => g.key === r.surplus);
  return (
    <Drawer open onClose={onClose} title={r.team} kicker={`${r.manager}${r.isMe ? ' · you' : ''} · ${r.wins}–${r.losses}${r.ties ? `–${r.ties}` : ''}`}>
      <div className="rd-stats">
        <div className="stat"><span className="micro">power rating</span><span className="v">{formatPoints1(r.power)} <span className="dim rd-sm">{ordinal(r.powerRank)} of {n}</span></span></div>
        <div className="stat"><span className="micro">ros strength</span><span className="v">{formatCount(r.rosPts)} <span className="dim rd-sm">{ordinal(r.rosRank)}</span></span></div>
        <div className="stat"><span className="micro">playoff weeks</span><span className="v">{formatCount(r.playoffPts)} <span className="dim rd-sm">{ordinal(r.playoffRank)}</span></span></div>
        <div className="stat">
          <span className="micro">roster vs record</span>
          <span className={`v ${r.delta > 0 ? 'pos-c' : r.delta < 0 ? 'neg-c' : ''}`}>{r.delta === 0 ? '±0' : signed(r.delta, 0)}</span>
          <span className="note">roster says {ordinal(r.powerRank)}, record says {ordinal(r.recordRank)}</span>
        </div>
      </div>

      <section aria-label={`Position groups for ${r.team}`}>
        <h3>position groups</h3>
        <ul className="plain rd-groups">
          {r.groups.map((g) => (
            <li key={g.key} className="rd-group">
              <span className="rd-g-head"><TierChip group={g.key} tier={g.tier} /><span className="dim">{ordinal(g.rank)} of {n}</span></span>
              <span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(2, g.percentile * 100)}%` }} /></span>
              <span className="rd-g-det dim">
                starters {formatCount(g.starters)} ros pts{g.key === 'FLEX' ? '' : ` · bench ${formatCount(g.depth)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <ul className="plain rd-needs">
        {need && (
          <li>
            <span className="micro">biggest need</span> <strong>{groupLabel(need.key)}</strong> <span className="dim">({need.tier}, {ordinal(need.rank)} in the league)</span>{' '}
            <Link to="/trades" className="btn quiet rd-link">find one on the trade block →</Link>
          </li>
        )}
        {surplus && (
          <li>
            <span className="micro">biggest surplus</span> <strong>{groupLabel(surplus.key)}</strong> <span className="dim">(bench depth {formatCount(surplus.depth)} ros pts: worth shopping)</span>{' '}
            <Link to="/trades" className="btn quiet rd-link">offer it on the trade block →</Link>
          </li>
        )}
      </ul>

      {r.dynasty && (
        <div className="rd-stats">
          <div className="stat"><span className="micro">dynasty value</span><span className="v">{formatCount(r.dynasty.value)} <span className="dim rd-sm">{ordinal(r.dynasty.valueRank)}</span></span></div>
          <div className="stat"><span className="micro">26 and under</span><span className="v">{r.dynasty.youthShare == null ? '—' : `${Math.round(r.dynasty.youthShare * 100)}%`}</span></div>
        </div>
      )}
    </Drawer>
  );
}
