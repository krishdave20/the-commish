import { useId, useMemo } from 'react';
import { formatPoints1 } from '../../../app/format';
import { AvatarName } from '../../../components/Avatar';
import { PlayerLink } from '../../../components/PlayerLink';
import { SectionHeader } from '../../../components/SectionHeader';
import { SLOT_LABEL } from '../../../engine';
import type { HingeSide, HingeStarter } from '../../../engine/hinges';
import { opponentText, statusText } from './format';
import { pairStarters, projectionOf, slotShare } from './pairing';
import { useMatchupData } from './useMatchupData';
import './matchup.css';

export const HEAD_TO_HEAD_TITLE = 'starters, head to head';

function Player({ p, mirror }: { p: HingeStarter | null; mirror?: boolean }) {
  if (!p) return <div className="h2h-side" data-mirror={mirror ? 'true' : undefined}><span className="dim">empty slot</span></div>;
  const proj = projectionOf(p);
  return (
    <div className="h2h-side" data-mirror={mirror ? 'true' : undefined} data-state={p.state}>
      <AvatarName pid={p.pid} name={p.name} pos={p.pos} team={p.nfl ?? undefined} size={28}>
        <span className="h2h-who">
          <PlayerLink pid={p.pid} name={p.name} />
          <span className="h2h-meta">{p.pos.toLowerCase()} · {opponentText(p)} · <span className="h2h-status" data-state={p.state}>{statusText(p)}</span></span>
        </span>
      </AvatarName>
      <span className="h2h-nums">
        <b className="h2h-pts">{formatPoints1(p.actual)}</b>
        <span className="h2h-proj" title={p.assumed ? 'clock unavailable: half the game is assumed left' : 'projected for the week'}>
          proj {formatPoints1(proj)}{p.assumed && <sup>*</sup>}
        </span>
      </span>
    </div>
  );
}

interface TableProps { mine: HingeSide; theirs: HingeSide; labelId?: string }

/** The two lineups, mirrored: yours on the left, theirs on the right, a slot in the middle and a thin bar under each pair showing who has
    the bigger share of the slot's points. Presentational: the data comes in as two `HingeSide`s. */
export function HeadToHeadTable({ mine, theirs, labelId }: TableProps) {
  const pairs = useMemo(() => pairStarters(mine.starters, theirs.starters), [mine, theirs]);
  const total = (s: HingeSide) => ({ pts: s.actual, proj: s.actual + s.starters.reduce((x, p) => x + p.mu * p.remaining, 0) });
  const tm = total(mine), tt = total(theirs);
  return (
    <div className="h2h" role="list" aria-labelledby={labelId}>
      <div className="h2h-head" aria-hidden="true">
        <span className="h2h-team">{mine.name}</span><span /><span className="h2h-team" data-mirror="true">{theirs.name}</span>
      </div>
      {pairs.map((x, i) => {
        const share = slotShare(x.a, x.b);
        return (
          <div className="h2h-row" role="listitem" key={`${x.slot}-${i}`}>
            <Player p={x.a} />
            <span className="h2h-slot micro">{SLOT_LABEL[x.slot] ?? x.slot}</span>
            <Player p={x.b} mirror />
            <span className="h2h-bar" aria-hidden="true" data-basis={share?.basis} title={share ? `share of the slot’s ${share.basis}` : undefined}>
              {share && <><i className="a" style={{ width: `${share.a * 100}%` }} /><i className="b" style={{ width: `${(1 - share.a) * 100}%` }} /></>}
            </span>
          </div>
        );
      })}
      <div className="h2h-row h2h-total" role="listitem">
        <div className="h2h-side"><span className="h2h-nums"><b className="h2h-pts">{formatPoints1(tm.pts)}</b><span className="h2h-proj">proj {formatPoints1(tm.proj)}</span></span></div>
        <span className="h2h-slot micro">total</span>
        <div className="h2h-side" data-mirror="true"><span className="h2h-nums"><b className="h2h-pts">{formatPoints1(tt.pts)}</b><span className="h2h-proj">proj {formatPoints1(tt.proj)}</span></span></div>
      </div>
    </div>
  );
}

/** "Starters, head to head": this week's matchup for the signed-in team, slot by slot. */
export function HeadToHead() {
  const data = useMatchupData();
  const id = useId();
  if (!data) return null;
  return (
    <section className="card" aria-labelledby={`${id}-t`}>
      <SectionHeader
        id={`${id}-t`} title={HEAD_TO_HEAD_TITLE}
        tip="each slot, your starter against theirs: points so far, what is projected for the week, and where his game stands. the thin bar is each side’s share of the slot’s points (of the projections before anyone has scored)."
      />
      <HeadToHeadTable mine={data.mine} theirs={data.theirs} labelId={`${id}-t`} />
    </section>
  );
}
