import type { ReactNode } from 'react';
import type { PageKey } from './names';

/** The tab bar's line icons, in the app's own hand (the art in components/art): 24 px, round caps, `currentColor`, no fills of their own.
    Decorative: the label next to each one is the name. */
const PATHS: Partial<Record<PageKey | 'more', ReactNode>> = {
  // three players in a huddle, seen from above
  home: (
    <>
      <circle cx="12" cy="6.5" r="3" />
      <circle cx="6.5" cy="16" r="3" />
      <circle cx="17.5" cy="16" r="3" />
    </>
  ),
  // a football, laces along its long axis
  gameday: (
    <>
      <ellipse cx="12" cy="12" rx="9.2" ry="5.6" transform="rotate(-45 12 12)" />
      <path d="M9 15L15 9M9.8 12.8l1.4 1.4M11.3 11.3l1.4 1.4M12.8 9.8l1.4 1.4" />
    </>
  ),
  // a locker: door, vents, handle
  team: (
    <>
      <rect x="5.5" y="3" width="13" height="18" rx="1.8" />
      <path d="M8.5 7h7M8.5 9.5h7M8.5 12h7M14.5 16v2" />
    </>
  ),
  // a trophy
  race: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5.8a1.8 1.8 0 0 0 0 3.6H8M16 6h2.2a1.8 1.8 0 0 1 0 3.6H16" />
      <path d="M12 13v4M8.5 20h7M9.8 17h4.4" />
    </>
  ),
  // around the league: a ladder of bars, best on top
  league: <path d="M4 6h16M4 10.5h12M4 15h8.5M4 19.5h5" />,
  // the league: a shield
  nfl: <path d="M12 3l7 2.5v6c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9v-6L12 3zM12 8v8M8.5 11h7" />,
  // a speech bubble
  takes: <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-7l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5zM8 9.5h8M8 12.5h5" />,
  // a magnifier
  players: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>,
  // an add-and-drop swap
  waivers: <path d="M5 8h12M13.5 4.5L17 8l-3.5 3.5M19 16H7M10.5 12.5L7 16l3.5 3.5" />,
  // two arrows, one each way
  trades: <path d="M4 9h13M13.5 5.5L17 9l-3.5 3.5M20 15H7M10.5 11.5L7 15l3.5 3.5" />,
  // a draft board: a clipboard with rows
  draft: <><rect x="5.5" y="4.5" width="13" height="16" rx="1.8" /><path d="M9.5 4.5h5v2.5h-5zM8.5 11h7M8.5 14h7M8.5 17h4" /></>,
  // sliders
  settings: <path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5" />,
  // a book: how it works
  method: <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5v-13zM5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3" />,
  // three dots
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
};

export function TabIcon({ name }: { name: PageKey | 'more' }) {
  return (
    <svg className="tb-ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
