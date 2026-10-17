import { useMemo, useState } from 'react';
import { PlayerLink } from '../../components/PlayerLink';
import { Segmented } from '../../components/Segmented';
import { bestAvailable } from '../../engine';
import type { DraftPick } from '../../data';
import type { LiveSnapshot } from '../../engine';
import { BestAvailable } from './BestAvailable';
import { DraftBoard } from './DraftBoard';
import { LIVE_INTERVAL_MS, REPLAY_SPEEDS, nextDelay } from './pickFeed';
import type { FeedState } from './pickFeed';
import { ordinalPick, teamLabel } from './model';
import type { DraftRoom, OrderPlan } from './model';
import { valueLabel } from './valueText';

export interface ReplayControls {
  active: boolean;
  /** 0 is step mode, otherwise picks per second */
  speed: number;
  paused: boolean;
  cursor: number;
  total: number;
  done: boolean;
  start: () => void;
  exit: () => void;
  restart: () => void;
  step: () => void;
  setSpeed: (s: number) => void;
  setPaused: (p: boolean) => void;
}

interface Props {
  room: DraftRoom;
  plan: OrderPlan;
  feed: FeedState;
  /** what is feeding the panels: the real draft, a replay of a finished one, or nothing */
  source: 'live' | 'replay' | null;
  snapshot: LiveSnapshot | null;
  replay: ReplayControls;
  /** the league has a finished draft to replay */
  canReplay: boolean;
  draftPicks: number;
}

const clock = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour12: false });

function Status({ feed, source, plan }: Pick<Props, 'feed' | 'source' | 'plan'>) {
  const made = feed.picks.length;
  const total = plan.order.length;
  return (
    <div className="stack">
      <div className="row">
        {source === 'replay' ? <span className="chip gold">replay</span> : <span className="chip up">live</span>}
        <span className="note" role="status">
          {feed.complete ? `draft complete · ${made} of ${total} picks`
            : made === 0 ? `waiting for the first pick · ${total} picks in all`
            : `pick ${made} of ${total} made`}
        </span>
        {feed.lastUpdate !== null && source === 'live' && <span className="note">last update {clock(feed.lastUpdate)}</span>}
      </div>
      {source === 'live' && feed.error && (
        <p className="note gold-c" role="status">sleeper did not answer ({feed.error}). trying again in {Math.round(nextDelay(LIVE_INTERVAL_MS, feed.failures) / 1000)} s.</p>
      )}
      {source === 'live' && !feed.error && !feed.complete && <p className="note">checking sleeper every {LIVE_INTERVAL_MS / 1000} seconds while this tab is open.</p>}
    </div>
  );
}

function ReplayBar({ replay }: { replay: ReplayControls }) {
  return (
    <div className="row replay-bar">
      <Segmented label="Replay speed" value={replay.speed} onChange={replay.setSpeed} options={REPLAY_SPEEDS.map((s) => ({ value: s.value, label: s.label }))} />
      {replay.speed !== 0 && !replay.done && (
        <button type="button" className="btn" onClick={() => replay.setPaused(!replay.paused)}>{replay.paused ? 'play' : 'pause'}</button>
      )}
      <button type="button" className="btn" disabled={replay.done} onClick={replay.step}>next pick</button>
      <button type="button" className="btn quiet" onClick={replay.restart}>restart</button>
      <button type="button" className="btn quiet" onClick={replay.exit}>exit replay</button>
    </div>
  );
}

/** The live assistant: best available, positional runs, your needs, who is likely gone, a pick feed and your roster. */
export function ClockTab({ room, plan, feed, source, snapshot, replay, canReplay, draftPicks }: Props) {
  const { rankings, teams, fcUsed } = room;
  const [pos, setPos] = useState('all');
  const [all, setAll] = useState(false);

  const best = useMemo(
    () => bestAvailable(rankings, feed.picks, { limit: 12, pos: pos === 'all' ? undefined : pos }),
    [rankings, feed.picks, pos],
  );
  const positions = useMemo(() => [...new Set(rankings.rows.map((r) => r.pos))].filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p)), [rankings]);
  const board = useMemo(() => feed.picks.map((p: DraftPick) => ({ pickNo: p.pick_no, pid: p.player_id })), [feed.picks]);
  const slotOf = useMemo(() => new Map(plan.order.map((o) => [o.pickNo, o])), [plan.order]);

  if (room.mode !== room.draftMode) {
    return (
      <section className="card" aria-labelledby="clock-title">
        <header><div className="micro">follows your league’s draft</div><h2 id="clock-title">on the clock</h2></header>
        <p className="note">your league’s draft is a {room.draftMode} draft, but the room is showing {room.mode} values.</p>
        <div><button type="button" className="btn solid" onClick={() => room.setMode(room.draftMode)}>use {room.draftMode} rankings</button></div>
      </section>
    );
  }

  if (!source || !snapshot) {
    return (
      <section className="card" aria-labelledby="clock-title">
        <header><div className="micro">live draft assistant</div><h2 id="clock-title">on the clock</h2></header>
        {canReplay ? (
          <>
            <p className="note">your league’s draft is complete ({draftPicks} picks). you can replay it pick by pick to see what the assistant shows during a draft.</p>
            <div><button type="button" className="btn solid" onClick={replay.start}>replay your draft</button></div>
          </>
        ) : (
          <p className="note">no draft in progress. the assistant wakes up when your league’s draft starts.</p>
        )}
      </section>
    );
  }

  const { turn, needs, runs, gone } = snapshot;
  const recent = Math.min(8, feed.picks.length);
  const activeRuns = runs.filter((r) => r.isRun);
  const feedRows = snapshot.values.slice().reverse();
  const listed = all ? feedRows : feedRows.slice(0, 20);
  const teamOfPick = (no: number, rosterId: number) => teamLabel(teams, rosterId || (slotOf.get(no)?.rosterId ?? 0));

  return (
    <div className="stack">
      <section className="card" aria-labelledby="clock-title">
        <header>
          <div className="micro">{source === 'replay' ? 'a saved draft, replayed' : 'polling sleeper'}</div>
          <h2 id="clock-title">on the clock</h2>
        </header>
        <Status feed={feed} source={source} plan={plan} />
        {source === 'replay' && <ReplayBar replay={replay} />}
        <p className="take" aria-live="polite">
          {turn.currentPickNo === null ? 'the draft is over.'
            : turn.picksBetween === null ? `pick ${turn.currentPickNo} is on the clock. you have no picks left.`
            : turn.picksBetween === 0 ? `you’re on the clock at pick ${turn.nextPickNo}.`
            : `your next pick is #${turn.nextPickNo}, ${turn.picksBetween} pick${turn.picksBetween === 1 ? '' : 's'} away.`}
        </p>
      </section>

      <div className="grid2">
        <section className="card" aria-labelledby="best-title">
          <header>
            <div className="micro">by value over replacement · drafted players are hidden</div>
            <h2 id="best-title">best available</h2>
          </header>
          <Segmented label="Best available position" value={pos} onChange={setPos} options={[{ value: 'all', label: 'all' }, ...positions.map((p) => ({ value: p, label: p.toLowerCase() }))]} />
          <BestAvailable rows={best} caption="Best available players" showFc={fcUsed && room.mode !== 'redraft'} />
        </section>

        <div className="stack">
          <section className="card" aria-labelledby="runs-title">
            <header>
              <div className="micro">the last {recent} picks by position</div>
              <h2 id="runs-title">positional runs</h2>
            </header>
            {activeRuns.length === 0 ? <p className="note">no run right now.</p> : (
              <ul className="plain" aria-label="Positional runs">
                {activeRuns.map((r) => <li key={r.pos} className="gold-c">{r.pos.toLowerCase()} run: {r.observed} of the last {recent} picks</li>)}
              </ul>
            )}
            <p className="note">
              {runs.filter((r) => r.observed > 0).map((r) => `${r.pos.toLowerCase()} ${r.observed}`).join(' · ') || 'nothing drafted yet'}
            </p>
          </section>

          <section className="card" aria-labelledby="needs-title">
            <header>
              <div className="micro">starting slots you have not filled</div>
              <h2 id="needs-title">your needs</h2>
            </header>
            {needs.openSlots.length === 0 ? <p className="note">every starting slot is filled. depth from here.</p> : (
              <div className="chips" aria-label="Open starting slots">
                {needs.openSlots.map((s, i) => <span key={`${s}${i}`} className="chip">{s.replace(/_/g, ' ').toLowerCase()}</span>)}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="grid2">
        <section className="card" aria-labelledby="gone-title">
          <header>
            <div className="micro">{turn.nextPickNo === null ? 'you have no picks left' : `by your pick at #${turn.nextPickNo}, adp says`}</div>
            <h2 id="gone-title">likely gone</h2>
          </header>
          {turn.nextPickNo === null ? <p className="note">nothing to wait for.</p>
            : turn.picksBetween === 0 ? <p className="note">you’re up: take your player now.</p>
            : gone.length === 0 ? <p className="note">nobody on the board is likely to go before you pick.</p>
            : (
              <ul className="plain" aria-label="Likely gone before your pick">
                {gone.slice(0, 8).map((g) => (
                  <li key={g.player.pid} className="pv">
                    <span><PlayerLink pid={g.player.pid} name={g.player.name} /> <span className="dim">{g.player.pos.toLowerCase()}{g.player.posRank}</span></span>
                    <span className="dim">{Math.round(g.probGone * 100)}% gone</span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="card" aria-labelledby="roster-title">
          <header>
            <div className="micro">{needs.roster.length} drafted</div>
            <h2 id="roster-title">your roster so far</h2>
          </header>
          {needs.roster.length === 0 ? <p className="note">no picks yet.</p> : (
            <ol className="mypicks" aria-label="Your picks">
              {needs.roster.map((r) => <li key={r.pid}><PlayerLink pid={r.pid} name={r.name} /> <span className="dim">{r.pos.toLowerCase()}{r.posRank} · {r.team ?? 'fa'}</span></li>)}
            </ol>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="feed-title">
        <header>
          <div className="micro">newest first · value is the pick number against adp</div>
          <h2 id="feed-title">pick feed</h2>
        </header>
        {feedRows.length === 0 ? <p className="note">no picks yet.</p> : (
          <ol className="feed" aria-label="Pick feed">
            {listed.map((v) => {
              const l = valueLabel(v.value);
              const o = slotOf.get(v.pickNo);
              return (
                <li key={v.pickNo} className={v.rosterId === room.myRosterId ? 'mine' : undefined}>
                  <span className="dim">#{v.pickNo}{o ? ` · ${ordinalPick(o.round, o.slot)}` : ''}</span>
                  <span className="who">{teamOfPick(v.pickNo, v.rosterId)}</span>
                  <span><PlayerLink pid={v.pid} name={v.name} /> <span className="dim">{v.pos.toLowerCase()}</span></span>
                  <span className={l.tone}>{l.text}</span>
                </li>
              );
            })}
          </ol>
        )}
        {feedRows.length > listed.length && <div><button type="button" className="btn" onClick={() => setAll(true)}>show all {feedRows.length}</button></div>}
      </section>

      <section className="card" aria-labelledby="live-board-title">
        <header>
          <div className="micro">your column is highlighted</div>
          <h2 id="live-board-title">the board</h2>
        </header>
        <DraftBoard order={plan.order} picks={board} rankings={rankings} teams={teams} myRosterId={room.myRosterId} onClockNo={turn.currentPickNo} caption="Draft board" />
      </section>
    </div>
  );
}
