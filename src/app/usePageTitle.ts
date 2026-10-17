import { useEffect } from 'react';
import { documentTitle, pageForPath } from './names';

/** Sets document.title to "locker room · the commish" for a route path. */
export function usePageTitle(path: string): void {
  useEffect(() => {
    document.title = documentTitle(pageForPath(path));
    // a new page starts at the top
    window.scrollTo?.(0, 0);
  }, [path]);
}
