import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLiveMaybe } from '../../app/live/liveContext';
import { MomentsScope } from '../../app/moments/MomentsProvider';
import { useMoments } from '../../app/moments/momentsContext';
import { activityTitle, buildActivities, compactText, stateKey, urgency } from '../../engine/moments';
import type { Activity } from '../../engine/moments';
import type { RawChange } from '../../engine/live';
import { useNflOnly } from '../../pages/nfl/useNflOnly';
import { useReducedMotion } from '../motion';
import { usePhone } from '../useMediaQuery';
import { ActivityIcon } from './icons';
import { armHaptics, tick } from './haptic';
import { setMatchupPillShowing } from './pillStore';
import { useActivityClock } from './useActivityClock';
import { useBigMoment } from './useBigMoment';
import { useShortScreen } from './useShortScreen';
import { useSwipe } from './useSwipe';
import { actionLabel, actionTo } from './labels';
import { CardHeader, Compact, Expanded } from './views';
import type { Flash } from './useBigMoment';
import '../../styles/live-activity.css';

const NO_CHANGES: readonly RawChange[] = [];
/** A press this long on the pill hides the activity until its next state change. */
export const LONG_PRESS_MS = 500;
/** What a tap on the sheet's scrim must not do: reach the page underneath. The click that follows the press is swallowed for this long. */
const CLICK_SHIELD_MS = 400;
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Seen { side: boolean | null; title: string }

/** The announcement for a change worth interrupting for: the draft clock reaching you, the live lead changing hands, the final whistle. Else null. */
function announcement(prev: Seen | null, a: Activity, later: boolean): string | null {
  const m = a.moment;
  if (a.kind === 'draft' && m.kind === 'draft-clock' && m.title === 'you’re on the clock' && prev?.title !== m.title) return m.title;
  const side = m.pill?.bar === undefined ? null : m.pill.bar >= 0.5;
  if (a.kind === 'matchup' && prev && prev.side !== null && side !== null && prev.side !== side) return `${m.title}. ${m.pill!.text}`;
  if (a.kind === 'recap' && !prev && later) return m.title;
  return null;
}

function Island() {
  const mv = useMoments();
  const live = useLiveMaybe();
  const phone = usePhone();
  const short = useShortScreen();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const panel = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLButtonElement>(null);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [hidden, setHidden] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<{ id: string; top: string | null } | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);

  /* what is going on, with its detail: the moments the engine says are ongoing, plus game day's live view and feed (no poller of its own) */
  const view = live && !live.replay ? live.view : null;
  const changes = live && !live.replay ? live.state.changes : NO_CHANGES;
  const all = useMemo(
    () => buildActivities(mv.ongoing, { ctx: mv.ctx, view, changes, draft: mv.draftLive ?? null }),
    [mv.ongoing, mv.ctx, view, changes, mv.draftLive],
  );
  const list = all;

  /* the clock: a second for a countdown that shows seconds, 15 s for the rest while it matters (a countdown, or the open card's "2 min ago") */
  const counting = list.some((a) => a.moment.countdownTo !== undefined);
  const precise = list.some((a) => a.moment.countdownTo !== undefined && a.moment.precise);
  const now = useActivityClock(counting || openFor !== null, precise ? 1000 : 15_000);

  /* hiding holds until the activity's state changes (the lead changing hands, the clock reaching you, a countdown turning urgent) */
  const visible = useMemo(() => list.filter((a) => hidden[a.id] !== stateKey(a, now)), [list, hidden, now]);
  // an activity that has gone takes its hiding with it, so the next one of its kind (next week's waivers) starts showing again
  const present = all.map((a) => a.id).join('|');
  const [presentThen, setPresentThen] = useState(present);
  if (present !== presentThen) {
    setPresentThen(present);
    const ids = present.split('|');
    const keep = Object.keys(hidden).filter((id) => ids.includes(id));
    if (keep.length !== Object.keys(hidden).length) setHidden(Object.fromEntries(keep.map((id) => [id, hidden[id]!])));
  }

  /* which one the pill shows: the best by priority, unless the viewer picked another (a pick lasts while the best one stays the best) */
  const topId = visible[0]?.id ?? null;
  const picked = focus && focus.top === topId ? visible.find((a) => a.id === focus.id) : undefined;
  const shown = picked ?? visible[0] ?? null;
  // a short screen has no room for the card: the pill stays compact (a tap goes straight to its action)
  const open = !!shown && !short && openFor === shown.id;
  const sheet = open && phone;
  const index = shown ? visible.indexOf(shown) : -1;

  const select = useCallback((a: Activity) => {
    setFocus({ id: a.id, top: topId });
    setOpenFor((o) => (o !== null ? a.id : o));
  }, [topId]);
  const go = useCallback((by: number) => {
    if (visible.length < 2 || index < 0) return;
    select(visible[(index + by + visible.length) % visible.length]!);
  }, [visible, index, select]);
  const hide = useCallback((a: Activity) => {
    setHidden((h) => ({ ...h, [a.id]: stateKey(a, now) }));
    setOpenFor(null);
  }, [now]);
  const fold = useCallback(() => { setOpenFor(null); head.current?.focus(); }, []);

  /* a big moment for my team: the pill widens for a few seconds with "+6.4 · chase" */
  const mine = view?.mine ?? null;
  const rid = mine ? (mine.a.isMe || !mine.b.isMe ? mine.a.rid : mine.b.rid) : null;
  const nameOf = useCallback((pid: string) => {
    const t = mine ? [...mine.a.starters, ...mine.b.starters].find((p) => p.pid === pid) : undefined;
    return t?.name ?? 'a starter';
  }, [mine]);
  const flash = useBigMoment(changes, rid, nameOf);

  /* a tiny tick for a big moment on a phone, where the device can (never on load: it waits for the viewer's first touch; not with reduced motion) */
  useEffect(() => { armHaptics(); }, []);
  useEffect(() => { if (flash && phone && !reduced) tick(10); }, [flash, phone, reduced]);

  /* the live region speaks only what matters: the clock reaching you, the lead changing hands, the final whistle, a big moment of yours. It is worked out as the
     activities change (not on each tick), from what was said about each one last time. */
  const [spoken, setSpoken] = useState<{ visible: Activity[] | null; flash: Flash | null; seen: Map<string, Seen>; text: string }>({ visible: null, flash: null, seen: new Map(), text: '' });
  if (spoken.visible !== visible || spoken.flash !== flash) {
    let seen = spoken.seen, say: string | null = null;
    if (spoken.visible !== visible) {
      seen = new Map();
      for (const a of visible) {
        say = announcement(spoken.seen.get(a.id) ?? null, a, spoken.visible !== null) ?? say;
        seen.set(a.id, { side: a.moment.pill?.bar === undefined ? null : a.moment.pill.bar >= 0.5, title: a.moment.title });
      }
    }
    if (flash && spoken.flash !== flash) say = `your score jumped ${flash.text}`;
    setSpoken({ visible, flash, seen, text: say ?? spoken.text });
  }

  // space is kept for the pill while it shows (see the phone and desktop rules), so it never sits on content it did not have to
  const showing = !!shown;
  useEffect(() => {
    if (!showing) return;
    document.body.dataset.la = 'on';
    return () => { delete document.body.dataset.la; };
  }, [showing]);

  // on a phone the live matchup in the pill is the score: the ticker drops its own pinned copy of it
  const pillIsMatchup = phone && shown?.kind === 'matchup';
  useEffect(() => {
    setMatchupPillShowing(pillIsMatchup);
    return () => setMatchupPillShowing(false);
  }, [pillIsMatchup]);

  /* a press that closes the sheet is not also a press on whatever is underneath: the click that follows it is swallowed (until the next press starts, or a moment passes) */
  const shield = useCallback(() => {
    const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    let timer = 0;
    const drop = () => {
      window.removeEventListener('click', swallow, { capture: true });
      window.removeEventListener('pointerdown', drop, { capture: true });
      window.clearTimeout(timer);
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.addEventListener('pointerdown', drop, { capture: true, once: true });
    timer = window.setTimeout(drop, CLICK_SHIELD_MS);
  }, []);

  // Esc and a tap outside fold the card back into the pill
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') fold(); };
    const onDown = (e: Event) => {
      if (!wrap.current || wrap.current.contains(e.target as Node)) return;
      if (phone) shield();
      setOpenFor(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open, phone, fold, shield]);

  // the sheet takes focus when it opens (the header row, which is also what folds it) and keeps Tab inside it
  useEffect(() => { if (sheet) head.current?.focus({ preventScroll: true }); }, [sheet]);
  const trapTab = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !wrap.current) return;
    const items = Array.from(wrap.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden]'));
    if (items.length === 0) return;
    const first = items[0]!, last = items[items.length - 1]!;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || !wrap.current.contains(at))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (at === last || !wrap.current.contains(at))) { e.preventDefault(); first.focus(); }
  };

  /* a swipe on the open card: left and right go between activities, up folds it. A top sheet is pulled up to close, so a swipe down does nothing on a phone;
     elsewhere a swipe down folds too (the way a bottom sheet goes). */
  const swipe = useSwipe(open, (dir) => {
    if (dir === 'left') go(1); else if (dir === 'right') go(-1); else if (dir === 'up' || !phone) fold();
  });

  /* a long press on the pill hides it until its next state change */
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; fired: boolean }>({ timer: null, x: 0, y: 0, fired: false });
  const clearPress = () => { if (press.current.timer !== null) { clearTimeout(press.current.timer); press.current.timer = null; } };
  useEffect(() => clearPress, []);
  const onHeadDown = (e: ReactPointerEvent) => {
    if (open || !shown || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const target = shown;
    press.current = { timer: setTimeout(() => { press.current.timer = null; press.current.fired = true; hide(target); }, LONG_PRESS_MS), x: e.clientX, y: e.clientY, fired: false };
  };
  const onHeadMove = (e: ReactPointerEvent) => {
    if (press.current.timer !== null && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) clearPress();
  };
  const onHeadClick = (e: ReactMouseEvent) => {
    if (press.current.fired) { press.current.fired = false; e.preventDefault(); return; }
    if (!shown) return;
    if (short) navigate(actionTo(shown)); else setOpenFor(open ? null : shown.id);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (sheet) trapTab(e);
    if (e.altKey || e.ctrlKey || e.metaKey || visible.length < 2) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };

  if (!shown) return null;
  const m = shown.moment;
  const minimals = visible.filter((a) => a !== shown);
  const room = phone ? 2 : 3;
  const flashing = flash && shown.kind === 'matchup' ? flash.text : null;
  // the width the circles take beside the pill on a phone, so the pill never grows into them
  const minsW = phone && !short && !open && minimals.length > 0 ? Math.min(minimals.length, room) * 38 + (minimals.length > room ? 26 : 0) + 6 : 0;
  const headName = short
    ? `${compactText(shown, now)}${flashing ? ` ${flashing}` : ''}, ${actionLabel(shown)}`
    : !open && shown.kind === 'matchup' && shown.data ? `${compactText(shown, now)}${flashing ? ` ${flashing}` : ''}` : undefined;
  return (
    <div
      className="la-wrap" ref={wrap} data-open={open ? 'true' : undefined} data-count={visible.length} data-short={short ? 'true' : undefined}
      style={minsW ? ({ ['--la-mins-w' as string]: `${minsW}px` }) : undefined}
      {...(sheet ? { role: 'dialog', 'aria-modal': true, 'aria-label': activityTitle(shown) } : {})}
      onKeyDown={onKeyDown}
    >
      {sheet && <div className="la-scrim" data-motion={reduced ? 'reduced' : 'ok'} aria-hidden="true" onPointerDown={() => { shield(); setOpenFor(null); }} />}
      <p className="sr-only" role="status" aria-live="polite">{spoken.text}</p>
      <div
        className="la" data-open={open ? 'true' : undefined} data-kind={shown.kind} data-motion={reduced ? 'reduced' : 'ok'} data-urgency={urgency(m, now)}
        data-live={m.live ? 'true' : undefined} data-flash={flashing ? 'true' : undefined}
      >
        <div
          className="la-card" onPointerDown={swipe.onPointerDown}
          onClickCapture={(e) => { if (swipe.swiped()) { e.preventDefault(); e.stopPropagation(); } }}
        >
          <button
            ref={head} type="button" className="la-head" aria-expanded={short ? undefined : open} aria-controls={short ? undefined : panel}
            // the score line is built from styled pieces; its name is the same words in one string (the team's name is what its monogram stands for)
            aria-label={headName}
            onClick={onHeadClick} onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={clearPress} onPointerLeave={clearPress} onPointerCancel={clearPress}
            onContextMenu={(e) => { if (press.current.fired || press.current.timer !== null) e.preventDefault(); }}
          >
            {open ? <CardHeader a={shown} /> : <Compact a={shown} now={now} flash={flashing} />}
            {mv.previewing && <span className="la-tag">preview</span>}
          </button>
          <div className="la-panel" id={panel} hidden={!open}>
            {open && (
              <>
                <Expanded a={shown} now={now} tz={tz} />
                <div className="la-bottom">
                  {visible.length > 1 && (
                    <div className="la-pager">
                      <button type="button" className="la-step" aria-label="previous activity" onClick={() => go(-1)}><span aria-hidden="true">‹</span></button>
                      <span className="la-dots" aria-hidden="true">{visible.map((a) => <i key={a.id} data-on={a === shown ? 'true' : undefined} />)}</span>
                      <span className="sr-only">activity {index + 1} of {visible.length}</span>
                      <button type="button" className="la-step" aria-label="next activity" onClick={() => go(1)}><span aria-hidden="true">›</span></button>
                    </div>
                  )}
                  <Link className="la-go" to={actionTo(shown)} onClick={() => setOpenFor(null)}>{actionLabel(shown)} →</Link>
                </div>
                {sheet && <span className="la-grab" aria-hidden="true" />}
              </>
            )}
          </div>
        </div>
      </div>
      {!open && !short && minimals.length > 0 && (
        <div className="la-mins">
          {minimals.slice(0, room).map((a) => (
            <button
              key={a.id} type="button" className="la-min" data-kind={a.kind} data-urgency={urgency(a.moment, now)} data-live={a.moment.live ? 'true' : undefined}
              data-flash={flash && a.kind === 'matchup' ? 'true' : undefined} aria-label={compactText(a, now)} onClick={() => select(a)}
            >
              <ActivityIcon kind={a.kind} />
            </button>
          ))}
          {minimals.length > room && <span className="la-more" aria-hidden="true">+{minimals.length - room}</span>}
        </div>
      )}
      <button type="button" className="la-x" aria-label={`dismiss ${m.label ?? 'live activity'}`} onClick={() => hide(shown)}><span aria-hidden="true">×</span></button>
    </div>
  );
}

/** A Dynamic Island–style pill for whatever is going on right now: your live score, a countdown to kickoff or waivers, the draft clock, the final whistle.
    The pill is the compact state: your monogram and score on the left, theirs and your win chance on the right, with a hairline of starter-minutes played. With
    several activities running the best one is the pill and the rest are minimal circles beside it (tap one to switch). Tap the pill to open a card with the detail and
    one action; swipe it left or right (or use the arrows) to move between activities, up to fold it; Esc or a tap outside folds it too. A long press or the × hides the
    activity until its next state change. A big jump in your score widens the pill for a moment ("+6.4 · chase").
    Floats top-centre under the ticker (`--activity-top`; on a phone it is the island, centred in the top bar's band, and an open card is a top sheet from it with a scrim,
    focus kept inside, swipe up or a tap outside to close; on a short screen it is the compact pill only and a tap goes to its action) and hides when nothing is ongoing.
    Mount once in the app shell, inside the live provider; it polls nothing of its own. */
export function LiveActivity() {
  const { pathname } = useLocation();
  const [nflOnly] = useNflOnly();
  // "nfl only" on the nfl page hides every fantasy overlay, and the pill is one
  if (nflOnly && pathname.startsWith('/nfl')) return null;
  return <MomentsScope lite><Island /></MomentsScope>;
}
