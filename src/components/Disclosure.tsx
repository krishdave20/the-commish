import type { ReactNode } from 'react';

interface Props {
  title: string;
  /** a short line at the right of the title row, shown while closed ("3 accounts") */
  hint?: ReactNode;
  /** the heading level of the title (default 2); the "inline" look has no heading */
  level?: 2 | 3;
  defaultOpen?: boolean;
  /** "inline": a small "more" link inside a card instead of a titled section */
  inline?: boolean;
  id?: string;
  children: ReactNode;
}

/** An accordion section on a native `<details>`: the summary is the title, the body opens in place. Used where a page is a stack of
    sections (front office, under the hood) and for "why it matters" style detail inside a card. */
export function Disclosure({ title, hint, level = 2, defaultOpen = false, inline = false, id, children }: Props) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <details className={`disclosure${inline ? ' inline' : ''}`} open={defaultOpen || undefined} id={id}>
      <summary>
        {inline ? <span>{title}</span> : <H>{title}</H>}
        {hint && <span className="sum-hint">{hint}</span>}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
