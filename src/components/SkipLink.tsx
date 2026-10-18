import type { MouseEvent } from 'react';

interface Props {
  /** id of the element to jump to (it needs tabIndex={-1} so it can take focus) */
  target?: string;
}

/** "skip to main content": the first tab stop on every page, hidden until it has focus.
    The app uses HashRouter, so a bare `#main` href would be read as a route; the click moves focus instead. */
export function SkipLink({ target = 'main' }: Props) {
  function go(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const el = document.getElementById(target);
    if (!el) return;
    el.focus();
    el.scrollIntoView?.({ block: 'start' });
  }
  return <a className="skip-link" href={`#${target}`} onClick={go}>skip to main content</a>;
}
