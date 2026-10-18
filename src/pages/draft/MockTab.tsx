import { useMemo, useState } from 'react';
import { BallSpiral } from '../../components/art/BallSpiral';
import { PlayerLink } from '../../components/PlayerLink';
import { SectionHeader } from '../../components/SectionHeader';
import { Segmented } from '../../components/Segmented';
import { bestAvailable } from '../../engine';
import type { DraftMode, RankedPlayer } from '../../engine';
import { BestAvailable } from './BestAvailable';
import { DraftBoard } from './DraftBoard';
import { GradeCard } from './GradeCard';
import { mySlotOf, ordinalPick, teamLabel } from './model';
import type { DraftRoom, OrderPlan } from './model';
import { useMockDraft } from './useMockDraft';

interface Props {
  room: DraftRoom;
  plan: OrderPlan;
}

const SHOWN = 12;

/** A mock draft against bots at your real slot (or any slot): board, best available, sim controls and the final grade. */
export function MockTab({ room, plan }: Props) {
  const { league, rankings, teams, fcUsed } = room;
  const defaultSlot = mySlotOf(room.draft, room.userId, plan, room.myRosterId) ?? 1;
  const m = useMockDraft({ leagueId: league.league_id, rankings, plan, defaultSlot });
  const { state } = m;
  const [pos, setPos] = useState('all');
  // the ball spirals in only for a draft that finishes while you watch, not for one that was already done when the tab opened
  const [wasComplete, setWasComplete] = useState(state.complete);
  const [justDone, setJustDone] = useState(false);
  if (wasComplete !== state.complete) { setWasComplete(state.complete); setJustDone(state.complete); }

  const gone = useMemo(() => state.picks.map((p) => ({ player_id: p.pid })), [state.picks]);
  const best = useMemo(
    () => (state.complete ? [] : bestAvailable(rankings, gone, { limit: SHOWN, pos: pos === 'all' ? undefined : pos })),
    [rankings, gone, pos, state.complete],
  );
  const positions = useMemo(() => [...new Set(rankings.rows.map((r) => r.pos))].filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p)), [rankings]);
  const mine = useMemo(() => state.picks.filter((p) => p.rosterId === m.userRosterId), [state.picks, m.userRosterId]);
  const next = state.next;
  const total = plan.order.length;
  const slots = useMemo(() => {
    const seen = new Map<number, number>();
    for (const o of plan.order) if (!seen.has(o.slot)) seen.set(o.slot, o.originalRosterId);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, [plan.order]);
  const myRealSlot = mySlotOf(room.draft, room.userId, plan, room.myRosterId);
  const board = useMemo(() => state.picks.map((p) => ({ pickNo: p.pickNo, pid: p.pid })), [state.picks]);

  return (
    <div className="stack">
      <section className="card" aria-labelledby="mock-title">
        <SectionHeader id="mock-title" title="mock draft" kicker={`${plan.type} · ${plan.teams} teams · ${plan.rounds} rounds`} tip="bots draft by adp, a little noise and roster need." />

        {plan.note && <p className="note">{plan.note}</p>}
        {m.elsewhere && (
          <p className="note gold-c" role="status">
            you have a saved {m.elsewhere.mode} mock ({m.elsewhere.log.length} picks).{' '}
            <button type="button" className="btn quiet" onClick={() => room.setMode(m.elsewhere!.mode as DraftMode)}>resume it</button>{' '}
            starting a new one here replaces it.
          </p>
        )}

        <div className="form-row">
          <label className="ctl">
            your slot
            <select value={m.slot} disabled={m.busy} onChange={(e) => m.setSlot(Number(e.target.value))} aria-label="Your draft slot">
              {slots.map(([slot, rid]) => (
                <option key={slot} value={slot}>{slot} · {teamLabel(teams, rid)}{slot === myRealSlot ? ' (your real slot)' : ''}</option>
              ))}
            </select>
          </label>
          <span className="chip flat" title="the same seed replays the same bots">seed {m.seed}</span>
          <button type="button" className="btn quiet" disabled={m.busy} onClick={m.reroll}>reroll</button>
          <button type="button" className="btn quiet" disabled={m.busy} onClick={m.restart}>restart</button>
        </div>

        <div className="stack">
          <div className="row between">
            <span className="note" role="status">
              {state.complete ? <>{`draft complete · ${total} picks`}<BallSpiral play={justDone} /></>
                : state.userOnClock ? <strong className="otc-line">you’re on the clock · pick {next!.pickNo} ({ordinalPick(next!.round, next!.slot)})</strong>
                : next ? `pick ${next.pickNo} of ${total} · ${teamLabel(teams, next.rosterId)} is on the clock` : ''}
              {m.busy ? ' · simulating…' : ''}
            </span>
            <span className="row">
              <button type="button" className="btn" disabled={m.busy || state.complete || state.userOnClock} onClick={() => { void m.simToMe(); }}>sim to my pick</button>
              <button type="button" className="btn" disabled={m.busy || state.complete} onClick={() => { void m.simRest(); }}>sim the rest</button>
              <button type="button" className="btn quiet" disabled={m.busy || !m.canUndo} onClick={m.undo}>undo last pick</button>
            </span>
          </div>
          <div className="bar" role="progressbar" aria-label="Mock draft progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={state.picks.length}><i style={{ width: `${(state.picks.length / Math.max(1, total)) * 100}%` }} /></div>
        </div>
      </section>

      {state.complete && state.grade && <GradeCard grade={state.grade} state={state} mock={m.mock} rankings={rankings} teams={teams} />}

      {!state.complete && (
        <div className="grid2">
          <section className="card" aria-labelledby="mock-best-title">
            <SectionHeader id="mock-best-title" title="best available" kicker={state.userOnClock ? 'pick one' : undefined} tip="ranked by value over replacement." />
            <Segmented label="Best available position" value={pos} onChange={setPos} options={[{ value: 'all', label: 'all' }, ...positions.map((p) => ({ value: p, label: p.toLowerCase() }))]} />
            <BestAvailable
              rows={best} caption="Best available players" showFc={fcUsed && room.mode !== 'redraft'}
              onPick={state.userOnClock && !m.busy ? (p: RankedPlayer) => m.pick(p.pid) : undefined}
            />
          </section>
          <section className="card" aria-labelledby="mock-mine-title">
            <SectionHeader id="mock-mine-title" title="your picks" kicker={`${mine.length} of ${plan.rounds} picks`} />
            {mine.length === 0 ? <p className="note">nobody yet. your first pick is #{plan.order.find((o) => o.rosterId === m.userRosterId)?.pickNo ?? '—'}.</p> : (
              <ol className="mypicks">
                {mine.map((p) => {
                  const r = rankings.byPid[p.pid];
                  return <li key={p.pickNo}><span className="dim">{ordinalPick(p.round, p.slot)}</span> <PlayerLink pid={p.pid} name={r?.name ?? p.pid} /> <span className="dim">{r ? `${r.pos.toLowerCase()}${r.posRank}` : ''}</span></li>;
                })}
              </ol>
            )}
          </section>
        </div>
      )}

      <section className="card" aria-labelledby="mock-board-title">
        <SectionHeader id="mock-board-title" title="the board" tip="your column is highlighted" />
        <DraftBoard order={plan.order} picks={board} rankings={rankings} teams={teams} myRosterId={m.userRosterId} onClockNo={next?.pickNo ?? null} caption="Mock draft board" />
      </section>
    </div>
  );
}
