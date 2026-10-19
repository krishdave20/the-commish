import { useMemo } from 'react';
import { signed } from '../../app/format';
import { DriveTurf } from '../../components/field';
import type { LiveCtx, LiveSnapshot, LiveView, MatchupLive, RawChange } from '../../engine/live';
import { playsFromChanges, topPlays } from './drivePlays';

interface Props {
  view: LiveView;
  ctx: LiveCtx;
  frames: readonly LiveSnapshot[];
  changes: readonly RawChange[];
  focus: MatchupLive;
  /** a live week or a replay: the feed fills as it runs. false: a finished week with nothing to watch */
  feed: boolean;
}

/** The drive chart: scoring updates as plays on a turf field with the margin line over it, and the same plays as a list underneath. */
export function DriveTab({ view, ctx, frames, changes, focus, feed }: Props) {
  const pair = view.mine ?? focus;
  const me = pair.a.isMe || !pair.b.isMe ? pair.a : pair.b;
  const opp = me === pair.a ? pair.b : pair.a;
  const rows = useMemo(
    () => (feed ? playsFromChanges(changes, ctx, frames, me.rid, opp.rid) : topPlays(view, me.rid, opp.rid)),
    [feed, changes, ctx, frames, view, me.rid, opp.rid],
  );
  const plays = useMemo(() => rows.map((r) => r.play), [rows]);
  if (feed && !rows.length) return <p className="note">no scoring updates yet. plays appear here as they happen.</p>;
  if (!rows.length) return <p className="note">nobody scored in this week’s lineups.</p>;
  const mode = feed ? 'live' : 'top';
  const byId = new Map(rows.map((r) => [r.play.id, r]));
  const list = feed ? plays : [...plays].sort((a, b) => b.points - a.points);
  return (
    <>
      <DriveTurf plays={plays} meName={me.name} oppName={opp.name} margin={feed ? me.actual - opp.actual : null} mode={mode} />
      {!feed && <p className="note">these are the week’s top scoring plays, in the order their games kicked off. replay the week to watch it drive.</p>}
      <ol className="gd-feed" aria-label={feed ? 'scoring updates, newest first' : 'top scoring plays'}>
        {list.map((p) => {
          const r = byId.get(p.id)!;
          return (
            <li key={p.id} data-me={r.mine ? 'true' : undefined} data-neg={p.points < 0 ? 'true' : undefined}>
              <span className="gd-feed-delta">{feed ? signed(p.points) : p.points.toFixed(1)}</span>
              <span className="gd-feed-what">
                <span className="gd-pname">{p.name}</span>
                {p.where && <span className="gd-meta"> · {p.where}</span>}
              </span>
              <span className="gd-feed-team">{r.team}</span>
              <span className="gd-feed-time">{r.time}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
