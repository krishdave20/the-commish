import { useEffect, useRef } from 'react';
import { bigMoments } from '../../engine/moments';
import { useLiveMaybe } from '../live/liveContext';
import { useMoments } from '../moments/momentsContext';
import { bigCandidate, candidatesFrom, decide } from './alerts';
import type { AlertCandidate } from './alerts';
import { loadAlertMemory, saveAlertMemory, useAlertsEnabled } from './alertsStore';
import { deliver, notificationPermission } from './notify';

/** Renders nothing. While alerts are on (and the browser allows them) it looks at the moments each time they are worked out (every 30 s, and on each live poll),
    asks the scheduler (alerts.ts) what to say, and raises it. Mounted once, inside the moments and live providers (PwaHost). */
export function AlertsRunner() {
  const enabled = useAlertsEnabled();
  const mv = useMoments();
  const live = useLiveMaybe();
  const view = live && !live.replay ? live.view : null;
  const changes = live && !live.replay ? live.state.changes : null;
  const first = useRef(true);
  const seenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) { first.current = true; seenAt.current = null; return; }
    // a `?now=` preview runs a made-up clock: nothing to tell anyone about
    if (mv.now === 0 || mv.previewing || notificationPermission() !== 'granted') return;

    const extra: AlertCandidate[] = [];
    const newest = changes ? changes.reduce((m, c) => Math.max(m, c.at), 0) : 0;
    // only polls that arrive after the first look count (the feed's history is not news)
    if (seenAt.current === null) seenAt.current = newest;
    const mine = view?.mine ?? null;
    if (changes && mine) {
      const rid = mine.a.isMe || !mine.b.isMe ? mine.a.rid : mine.b.rid;
      const big = bigMoments(changes, rid, seenAt.current)[0];
      if (big) {
        const who = [...mine.a.starters, ...mine.b.starters].find((p) => p.pid === big.pid);
        extra.push(bigCandidate(big, who?.name ?? 'a starter'));
      }
    }
    if (newest > seenAt.current) seenAt.current = newest;

    const { fire, memory } = decide(loadAlertMemory(), [...candidatesFrom(mv.moments, mv.now), ...extra].sort((a, b) => b.priority - a.priority), mv.now, first.current);
    first.current = false;
    saveAlertMemory(memory);
    if (fire) void deliver({ title: fire.title, body: fire.body, tag: fire.key, to: fire.to });
  }, [enabled, mv.moments, mv.now, mv.previewing, view, changes]);

  return null;
}
