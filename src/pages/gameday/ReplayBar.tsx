import { useReducer } from 'react';
import { formatKickoff } from '../../app/live/format';
import { useLive } from '../../app/live/liveContext';
import { Segmented } from '../../components/Segmented';
import { REPLAY_SPEEDS } from '../../engine/live';

/** "Replay week N": the one way to watch a whole slate unfold without waiting for Sunday, for any finished week. Same engine, same page.
    `week` is the finished week on screen; the button shows only for a week that is over. */
export function ReplayBar({ week }: { week: number | null }) {
  const live = useLive();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const r = live.replay;
  if (!r) {
    if (week === null || week < 1 || week >= live.currentWeek) return null;
    return (
      <div className="gd-replay">
        <button type="button" className="btn quiet" onClick={() => { void live.startReplay(week); }} disabled={live.replayLoading}>
          {live.replayLoading ? 'loading…' : `replay week ${week}`}
        </button>
        {live.replayError && <span className="note neg-c" role="status">{live.replayError}</span>}
      </div>
    );
  }
  const s = r.status();
  return (
    <div className="gd-replay" data-on="true" role="group" aria-label="replay controls">
      <span className="chip gold">replay · week {live.week}</span>
      <button
        type="button" className="btn solid"
        onClick={() => { if (s.complete) { r.restart(); void live.refresh(); } else if (s.playing) r.pause(); else r.play(); bump(); }}
      >
        {s.complete ? 'play again' : s.playing ? 'pause' : 'play'}
      </button>
      <Segmented
        label="replay speed" value={s.speed} onChange={(v) => { r.setSpeed(v); bump(); }}
        options={REPLAY_SPEEDS.map((v) => ({ value: v as number, label: `${v}×` }))}
      />
      <button type="button" className="btn quiet" onClick={() => { r.restart(); void live.refresh(); }}>restart</button>
      <button type="button" className="btn quiet" onClick={live.stopReplay}>stop replay</button>
      <span className="gd-replay-clock" aria-label="replay progress">
        <span className="progress determinate" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.fraction * 100)} aria-label="replay progress">
          <i style={{ width: `${Math.round(s.fraction * 100)}%` }} />
        </span>
        <span>{formatKickoff(s.clock)}</span>
      </span>
    </div>
  );
}
