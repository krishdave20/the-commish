import { useEffect } from 'react';
import { documentTitle, pageForPath } from './names';

/** Sets document.title to "locker room · the commish" for a route path. */
export function usePageTitle(path: string): void {
  useEffect(() => {
    // a path with no page of its own (a player's profile) names itself with useTitle; the shell must not overwrite that
    const page = pageForPath(path);
    if (page) document.title = documentTitle(page);
    // a new page starts at the top
    window.scrollTo?.(0, 0);
  }, [path]);
}

/** Sets document.title to "<name> · the commish" for a page whose title is data (a player's name). */
export function useTitle(name: string): void {
  useEffect(() => {
    document.title = `${name} · the commish`;
  }, [name]);
}
