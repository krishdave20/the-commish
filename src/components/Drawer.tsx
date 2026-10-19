import { useEffect, useId, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePhone } from './useMediaQuery';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** How far (px) a downward drag must go to close the sheet, or how far with a quick flick. */
export const SHEET_CLOSE_DISTANCE = 96;
const SHEET_FLICK_DISTANCE = 32;
const SHEET_FLICK_SPEED = 0.6; // px per ms

/** A modal layer for details. Wide screens: a drawer from the right. Phones: a bottom sheet with a drag handle (swipe it down, or the
    handle and the title bar, to close; the page behind stays put). Esc and the backdrop close either, Tab stays inside, focus returns afterwards. */
export function Drawer({ open, onClose, title, kicker, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const sheet = usePhone();
  const drag = useRef<{ y0: number; t0: number; dy: number } | null>(null);

  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      else if (!panel.contains(at)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open]);

  // ---- swipe down to close (phones). The handle and the title bar are the grip; the panel follows the finger, then either leaves or springs back.
  function setOffset(dy: number | null) {
    const el = panelRef.current;
    if (!el) return;
    // let go short of the line: spring back
    if (dy === null) { el.style.transition = 'transform var(--t-base) var(--ease)'; el.style.transform = 'none'; return; }
    el.style.transition = 'none';
    el.style.transform = `translateY(${dy}px)`;
  }
  function onGripDown(e: ReactPointerEvent<HTMLElement>) {
    if (!sheet || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // a tap on the close button is a tap, not the start of a drag
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { y0: e.clientY, t0: e.timeStamp, dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onGripMove(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    setOffset(d.dy);
  }
  function onGripEnd(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.t0);
    const quick = d.dy >= SHEET_FLICK_DISTANCE && d.dy / dt >= SHEET_FLICK_SPEED;
    if (e.type !== 'pointercancel' && (d.dy >= SHEET_CLOSE_DISTANCE || quick)) onClose();
    else setOffset(null);
  }

  if (!open) return null;
  const grip = sheet
    ? { onPointerDown: onGripDown, onPointerMove: onGripMove, onPointerUp: onGripEnd, onPointerCancel: onGripEnd }
    : {};
  return createPortal(
    <div className="drawer-root" data-sheet={sheet ? 'true' : undefined}>
      <div className="drawer-backdrop" onClick={() => onClose()} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panelRef}>
        {sheet && <div className="sheet-handle" data-testid="sheet-handle" {...grip}><span aria-hidden="true" /></div>}
        <header className="drawer-head" {...grip}>
          <div>
            {kicker && <div className="micro">{kicker}</div>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="btn quiet" onClick={() => onClose()}>Close</button>
        </header>
        <div className="drawer-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
