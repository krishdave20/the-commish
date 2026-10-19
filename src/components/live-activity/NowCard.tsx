import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveMaybe } from '../../app/live/liveContext';
import { useMoments } from '../../app/moments/momentsContext';
import { activityTitle, buildActivities, urgency } from '../../engine/moments';
import { usePhone } from '../useMediaQuery';
import { actionLabel, actionTo } from './labels';
import { useActivityClock } from './useActivityClock';
import { CardHeader, Expanded } from './views';
import '../../styles/live-activity.css';

const NONE: never[] = [];

/** The lock-screen widget: on a phone, a card on the huddle that mirrors the top activity (what the island up in the bar shows), in the island's own visual
    language: the inverse surface, the same header, centre and one action as the expanded view. Static (no open, fold or swipe): the island is for that. Renders
    nothing on a wide screen or when nothing is ongoing. Needs the moments (the huddle's) and, for the live matchup, game day's live provider. */
export function NowCard() {
  const phone = usePhone();
  const mv = useMoments();
  const live = useLiveMaybe();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const view = live && !live.replay ? live.view : null;
  const changes = live && !live.replay ? live.state.changes : NONE;
  const list = useMemo(
    () => buildActivities(mv.ongoing, { ctx: mv.ctx, view, changes, draft: mv.draftLive ?? null }),
    [mv.ongoing, mv.ctx, view, changes, mv.draftLive],
  );
  const a = list[0] ?? null;
  const counting = !!a && a.moment.countdownTo !== undefined;
  const now = useActivityClock(phone && !!a, counting && a?.moment.precise ? 1000 : 15_000);
  if (!phone || !a) return null;
  return (
    <section className="la la-widget" data-kind={a.kind} data-urgency={urgency(a.moment, now)} data-live={a.moment.live ? 'true' : undefined} aria-label={`now: ${activityTitle(a)}`}>
      <div className="la-card">
        <div className="la-head" role="presentation"><CardHeader a={a} />{mv.previewing && <span className="la-tag">preview</span>}</div>
        <div className="la-panel">
          <Expanded a={a} now={now} tz={tz} />
          <div className="la-bottom"><Link className="la-go" to={actionTo(a)}>{actionLabel(a)} →</Link></div>
        </div>
      </div>
    </section>
  );
}
