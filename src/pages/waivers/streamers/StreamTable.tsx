import { signed, formatMoney, formatPoints1 } from '../../../app/format';
import { AvatarName } from '../../../components/Avatar';
import { MatchupGrade } from '../../../components/MatchupGrade';
import { PlayerLink } from '../../../components/PlayerLink';
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

/** The first column's look and the "vs your starter" cell, shared by every position. */
export function StreamTable({ card, more, wire, onTry }: Props) {
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
