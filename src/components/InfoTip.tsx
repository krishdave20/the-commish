import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  /** what the note is about, e.g. "playoff odds": the button reads "about playoff odds" */
  label: string;
  /** the short note (lowercase, one or two sentences) */
  children: ReactNode;
  /** start open (tests, and a page that wants one note showing) */
  defaultOpen?: boolean;
}

/** A small "?" beside a section title. Tapping it opens a short note right under the title (inline, so it never covers anything
    and never leaves the screen); tapping again or pressing Esc closes it and keeps focus on the button.
    Put it, with the heading, in a `.title-row`: the note takes its own line there. */
export function InfoTip({ label, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // keep the place: focus on the note (or nowhere) goes back to the "?"
      const at = document.activeElement;
      if (!at || at === document.body || note.current?.contains(at)) button.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={button} type="button" className="tip-btn" aria-expanded={open} aria-controls={id}
        aria-label={`about ${label}`} onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">?</span>
      </button>
      <span ref={note} id={id} className="tip-note" role="note" hidden={!open}>{children}</span>
    </>
  );
}
