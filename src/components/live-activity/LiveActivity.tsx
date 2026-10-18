import { useLocation } from 'react-router-dom';
import { useNflOnly } from '../../pages/nfl/useNflOnly';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MomentsScope } from '../../app/moments/MomentsProvider';
import { useMoments } from '../../app/moments/momentsContext';
import type { Moment } from '../../engine/moments';
import { useReducedMotion } from '../motion';
import { countdownLine, pillText, urgency } from './text';
import { useActivityClock } from './useActivityClock';
import '../../styles/moments.css';

/** The announcement for a change worth interrupting for: the draft clock reaching you, or the live lead changing hands. Else null. */
function announcement(prev: { id: string; side: boolean | null; title: string } | null, m: Moment): string | null {
  if (m.kind === 'draft-clock' && m.title === 'you’re on the clock' && prev?.title !== m.title) return m.title;
  const side = m.pill?.bar === undefined ? null : m.pill.bar >= 0.5;
  if (prev && prev.id === m.id && prev.side !== null && side !== null && prev.side !== side) return `${m.title}. ${m.pill!.text}`;
  return null;
}

function Activity({ moment: m, previewing }: { moment: Moment; previewing: boolean }) {
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLButtonElement>(null);
  const panel = useId();
  const reduced = useReducedMotion();
  const prev = useRef<{ id: string; side: boolean | null; title: string } | null>(null);
  const now = useActivityClock(true);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    const say = announcement(prev.current, m);
    prev.current = { id: m.id, side: m.pill?.bar === undefined ? null : m.pill.bar >= 0.5, title: m.title };
    if (say) setAnnounce(say);
  }, [m]);

  // space is kept for the pill while it shows (see moments.css), so it never sits on content it did not have to
  useEffect(() => {
    document.body.dataset.la = 'on';
    return () => { delete document.body.dataset.la; };
  }, []);

  // Esc and a tap outside fold the card back into the pill
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      head.current?.focus();
    };
    const onDown = (e: Event) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);

  const text = pillText(m, now);
  const big = countdownLine(m, now, tz);
  const bar = m.pill?.bar;
  return (
    <div className="la" ref={root} data-open={open ? 'true' : undefined} data-motion={reduced ? 'reduced' : 'ok'} data-urgency={urgency(m, now)} data-live={m.live ? 'true' : undefined}>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <div className="la-card">
        <button ref={head} type="button" className="la-head" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}>
          <span className="la-dot" aria-hidden="true" />
          <span className="la-text">{text}</span>
          {bar !== undefined && <span className="la-bar" aria-hidden="true"><i style={{ width: `${Math.round(bar * 100)}%` }} /></span>}
          {previewing && <span className="la-tag">preview</span>}
        </button>
        <div className="la-panel" id={panel} hidden={!open}>
          <p className="la-title">{m.title}</p>
          <p className="la-detail">{m.detail}</p>
          {big && <p className="la-big">{big}</p>}
          <Link className="la-go" to={m.action.to} onClick={() => setOpen(false)}>{m.action.label} →</Link>
        </div>
      </div>
    </div>
  );
}

function Pill() {
  const { ongoing, previewing } = useMoments();
  const top = ongoing[0] ?? null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!top || top.id === dismissed) return null;
  return (
    <div className="la-wrap">
      {/* keyed by moment: a new moment starts folded, and a dismissed one stays gone until something else takes its place */}
      <Activity key={top.id} moment={top} previewing={previewing} />
      <button type="button" className="la-x" aria-label={`dismiss ${top.label ?? 'live activity'}`} onClick={() => setDismissed(top.id)}><span aria-hidden="true">×</span></button>
    </div>
  );
}

/** A small Dynamic Island–style pill for whatever is going on right now: a live score, a countdown to waivers or kickoff, the draft clock.
    Tap to open a card with the detail and the action; Esc or a tap outside folds it; the × hides it until the next moment.
    Floats top-centre under the ticker (bottom-centre above the safe area on a phone) and hides when nothing is ongoing.
    Mount once in the app shell, inside the live provider. */
export function LiveActivity() {
  const { pathname } = useLocation();
  const [nflOnly] = useNflOnly();
  // "nfl only" on the nfl page hides every fantasy overlay, and the pill is one
  if (nflOnly && pathname.startsWith('/nfl')) return null;
  return <MomentsScope lite><Pill /></MomentsScope>;
}
