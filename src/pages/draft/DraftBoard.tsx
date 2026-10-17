import { useMemo } from 'react';
import type { PickSlot, Rankings } from '../../engine';
import { ordinalPick, teamLabel } from './model';
import type { TeamInfo } from './model';

export interface BoardPick { pickNo: number; pid: string }

interface Props {
  order: readonly PickSlot[];
  picks: readonly BoardPick[];
  rankings: Rankings;
  teams: ReadonlyMap<number, TeamInfo>;
  /** the roster whose column and picks are highlighted */
  myRosterId: number | null;
  /** the pick on the clock, if any */
  onClockNo: number | null;
  caption: string;
}

/** Rounds down, teams across (in first-round slot order), cells coloured by position. Traded picks sit in the slot they came from. */
export function DraftBoard({ order, picks, rankings, teams, myRosterId, onClockNo, caption }: Props) {
  const grid = useMemo(() => {
    const rounds = new Map<number, Map<number, PickSlot>>();
    const slots = new Map<number, number>();
    for (const o of order) {
      let row = rounds.get(o.round);
      if (!row) { row = new Map(); rounds.set(o.round, row); }
      row.set(o.slot, o);
      if (!slots.has(o.slot)) slots.set(o.slot, o.originalRosterId);
    }
    return { rounds: [...rounds.entries()].sort((a, b) => a[0] - b[0]), slots: [...slots.entries()].sort((a, b) => a[0] - b[0]) };
  }, [order]);
  const made = useMemo(() => new Map(picks.map((p) => [p.pickNo, p.pid])), [picks]);

  return (
    <div className="tw board-wrap">
      <table className="board">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="rd">rd</th>
            {grid.slots.map(([slot, rid]) => (
              <th key={slot} scope="col" className={rid === myRosterId ? 'mine' : undefined} title={teams.get(rid)?.manager}>
                <span className="slot-no">{slot}</span> {teamLabel(teams, rid)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rounds.map(([round, row]) => (
            <tr key={round}>
              <th scope="row" className="rd">{round}</th>
              {grid.slots.map(([slot]) => {
                const o = row.get(slot);
                if (!o) return <td key={slot} />;
                const pid = made.get(o.pickNo);
                const p = pid ? rankings.byPid[pid] : undefined;
                const traded = o.rosterId !== o.originalRosterId;
                const mine = myRosterId !== null && o.rosterId === myRosterId;
                const clock = onClockNo === o.pickNo;
                const cls = ['cell', p ? `pos-${p.pos.toLowerCase()}` : pid ? 'pos-x' : 'empty', mine ? 'mine' : '', clock ? 'otc' : ''].filter(Boolean).join(' ');
                return (
                  <td key={slot} className={cls} title={traded ? `pick ${o.pickNo}, traded to ${teamLabel(teams, o.rosterId)}` : `pick ${o.pickNo}`} aria-current={clock ? 'step' : undefined}>
                    {pid ? (
                      <>
                        <span className="cn">{p?.name ?? pid}</span>
                        <span className="cm">{p ? `${p.pos.toLowerCase()}${p.posRank}` : ''} · {ordinalPick(round, slot)}{traded ? ' ↔' : ''}</span>
                      </>
                    ) : (
                      <span className="cm">{clock ? 'on the clock' : `${ordinalPick(round, slot)}${traded ? ' ↔' : ''}`}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
