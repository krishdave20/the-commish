import { useEffect, useState } from 'react';

/** Whether the page has scrolled far enough for a large title to have gone under the top bar. A little hysteresis (collapse past `at`,
    expand again only once back above `at` minus `slack`) so the title never flickers at the edge. Passive listener, one state flip per crossing. */
export function useScrolled(at = 44, slack = 20): boolean {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > at);
  useEffect(() => {
    const read = () => {
      const y = window.scrollY;
      setScrolled((was) => (was ? y > at - slack : y > at));
    };
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, [at, slack]);
  return scrolled;
}
