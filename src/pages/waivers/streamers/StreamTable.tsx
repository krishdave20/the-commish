import { signed, formatMoney, formatPoints1 } from '../../../app/format';
import { AvatarName } from '../../../components/Avatar';
import { MatchupGrade } from '../../../components/MatchupGrade';
import { PlayerLink } from '../../../components/PlayerLink';
import { DetailRow, ExpandCell } from '../../../components/RowExpand';
import { onOwnControl, useExpanded } from '../../../components/expandState';
import { usePhone } from '../../../components/useMediaQuery';
import { Fragment, useId } from 'react';
import type { ModelPlayer } from '../../../engine';
import type { StreamCard, StreamRow } from '../../../engine/streaming';
import { PlayerTags } from '../../team/PlayerTags';

interface Props {
  card: StreamCard;
  /** show the secondary columns (two-week total, next three opponents, bid) */
  more: boolean;
  /** the waiver board's bid and drop for a player on it */
  wire: ReadonlyMap<string, { bid: number; drop: ModelPlayer }>;
  onTry: (row: StreamRow) => void;
}

/** A phone: player, projection and the gap to your starter in the row; the opponent, range, next games, bid and "try" open under it. */
function StreamCompact({ card, wire, onTry }: Omit<Props, 'more'>) {
  const open = useExpanded();
  const base = useId();
  return (
    <div className="tw" data-compact="true">
      <table>
        <caption className="sr-only">{`Streamers: ${card.label}`}</caption>
        <thead>
          <tr>
            <th scope="col">player</th>
            <th scope="col" className="n">proj</th>
            <th scope="col" className="n">vs your starter</th>
            <th scope="col" className="xc"><span className="sr-only">details</span></th>
          </tr>
        </thead>
        <tbody>
          {card.rows.map((r) => {
            const p = r.player;
            const hit = wire.get(r.pid);
            const isOpen = open.isOpen(r.pid);
            const id = `${base}-${r.pid}`;
            return (
              <Fragment key={r.pid}>
                <tr className={isOpen ? 'click xopen' : 'click'} tabIndex={0}
                  onClick={(e) => { if (!onOwnControl(e)) open.toggle(r.pid); }}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open.toggle(r.pid); } }}
                >
                  <td className="nowrap">
                    <AvatarName pid={p.pid} name={p.name} pos={p.pos} team={p.nfl ?? undefined} size={28}>
                      <PlayerLink pid={p.pid} name={p.name} />{p.pos !== 'DEF' && <> <span className="dim">{p.nfl ?? ''}</span></>}<PlayerTags p={p} />
                    </AvatarName>
                  </td>
                  <td className="n">{formatPoints1(r.proj)}</td>
                  <td className="n">
                    <span className={r.diff > 0 ? 'pos-c' : r.diff < 0 ? 'neg-c' : 'dim'}>{signed(r.diff)}</span>
                    {r.upgrade && <> <span className="pill ok">upgrade</span></>}
                  </td>
                  <ExpandCell open={isOpen} controls={id} label={`${isOpen ? 'hide' : 'show'} details for ${p.name}`} onToggle={() => open.toggle(r.pid)} />
                </tr>
                {isOpen && (
                  <DetailRow
                    id={id} colSpan={4}
                    items={[
                      { label: 'opp', value: <MatchupGrade opponent={r.opp} dvp={r.dvp} /> },
                      { label: 'floor–ceiling', value: `${formatPoints1(r.floor)}–${formatPoints1(r.ceil)}` },
                      { label: 'vs your starter', value: r.starter ? `over ${r.starter.name}` : 'fills an empty slot' },
                      { label: '2-week total', value: <>{formatPoints1(r.twoWeek)}{r.hold && <> <span className="pill ok" title="best two-week total at this position">hold</span></>}</> },
                      { label: 'next 3', value: <span className="stream-ahead">{r.ahead.map((a) => <span key={a.week} className="nowrap"><span className="wk">{a.week}</span><MatchupGrade opponent={a.opp} dvp={a.dvp} showLabel={false} /></span>)}</span> },
                      { label: 'faab bid', value: hit ? formatMoney(hit.bid) : <span className="dim">$0–1 stream</span> },
                    ]}
                  >
                    <button type="button" className="btn xrow-act" aria-label={`try adding ${p.name}`} onClick={() => onTry(r)}>try him in the lab</button>
                  </DetailRow>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The first column's look and the "vs your starter" cell, shared by every position. */
export function StreamTable({ card, more, wire, onTry }: Props) {
  const phone = usePhone();
  if (phone) return <StreamCompact card={card} wire={wire} onTry={onTry} />;
  return (
    <div className="tw">
      <table>
        <caption className="sr-only">{`Streamers: ${card.label}`}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky-col">player</th>
            <th scope="col">opp</th>
            <th scope="col" className="n">proj</th>
            <th scope="col" className="n hide-sm">floor–ceiling</th>
            <th scope="col" className="n">vs your starter</th>
            {more && <th scope="col" className="n">2-week total</th>}
            {more && <th scope="col">next 3</th>}
            {more && <th scope="col" className="n">faab bid</th>}
            <th scope="col">try</th>
          </tr>
        </thead>
        <tbody>
          {card.rows.map((r) => {
            const p = r.player;
            const hit = wire.get(r.pid);
            return (
              <tr key={r.pid}>
                <td className="nowrap sticky-col">
                  <AvatarName pid={p.pid} name={p.name} pos={p.pos} team={p.nfl ?? undefined} size={28}>
                    <PlayerLink pid={p.pid} name={p.name} />{p.pos !== 'DEF' && <> <span className="dim">{p.nfl ?? ''}</span></>}<PlayerTags p={p} />
                  </AvatarName>
                </td>
                <td className="nowrap"><MatchupGrade opponent={r.opp} dvp={r.dvp} /></td>
                <td className="n">{formatPoints1(r.proj)}</td>
                <td className="n dim hide-sm">{formatPoints1(r.floor)}–{formatPoints1(r.ceil)}</td>
                <td className="n">
                  <span className={r.diff > 0 ? 'pos-c' : r.diff < 0 ? 'neg-c' : 'dim'}>{signed(r.diff)}</span>
                  {r.upgrade && <> <span className="pill ok">upgrade</span></>}
                  <span className="stream-over">{r.starter ? `over ${r.starter.name}` : 'fills an empty slot'}</span>
                </td>
                {more && <td className="n">{formatPoints1(r.twoWeek)}{r.hold && <> <span className="pill ok" title="best two-week total at this position">hold</span></>}</td>}
                {more && (
                  <td>
                    <span className="stream-ahead">
                      {r.ahead.map((a) => (
                        <span key={a.week} className="nowrap"><span className="wk">{a.week}</span><MatchupGrade opponent={a.opp} dvp={a.dvp} showLabel={false} /></span>
                      ))}
                    </span>
                  </td>
                )}
                {more && <td className="n">{hit ? formatMoney(hit.bid) : <span className="dim">$0–1 stream</span>}</td>}
                <td>
                  <button type="button" className="tog" aria-label={`try adding ${p.name}`} title="add him in the what-if lab" onClick={() => onTry(r)}>try</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
