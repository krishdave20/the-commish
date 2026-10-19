import type { ReactNode } from 'react';
import type { ActivityKind } from '../../engine/moments';

/** The live activity's line glyphs, in the same hand as the tab bar's (src/app/tabIcons.tsx): 24 px, round caps and joins, `currentColor`, no fills of their own.
    Decorative: the text beside each one is the name. */
const PATHS: Record<ActivityKind, ReactNode> = {
  // a football, laces along its long axis: the live matchup
  matchup: (
    <>
      <ellipse cx="12" cy="12" rx="9.2" ry="5.6" transform="rotate(-45 12 12)" />
      <path d="M9 15L15 9M9.8 12.8l1.4 1.4M11.3 11.3l1.4 1.4M12.8 9.8l1.4 1.4" />
    </>
  ),
  // a clock: kickoff and lineup lock
  kickoff: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  // a clipboard with a clip and a checked line: the waiver wire
  waivers: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16.5" rx="1.8" />
      <path d="M9.5 4.5V3.5h5v1M8.8 11.2l1.3 1.3 2.2-2.4M14 11.5h2.2M8.8 16.2l1.3 1.3 2.2-2.4M14 16.5h2.2" />
    </>
  ),
  // a draft board: columns of picks
  draft: (
    <>
      <rect x="4" y="4.5" width="16" height="15" rx="1.8" />
      <path d="M4 9.5h16M9.3 9.5v10M14.7 9.5v10M9.3 14.5h5.4" />
    </>
  ),
  // a whistle: the final whistle
  recap: (
    <>
      <circle cx="14.5" cy="14.2" r="5.3" />
      <path d="M9.5 11.2L3.8 9.6v3.4l5.4 1.2M14.5 8.9V5.5M11.8 14.2h5.4" />
    </>
  ),
  // a pulse: anything else that is going on
  generic: <path d="M3.5 12h4l2.5-6 4 12 2.5-6h4" />,
};

export function ActivityIcon({ kind, size = 20 }: { kind: ActivityKind; size?: number }) {
  return (
    <svg className="la-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[kind]}
    </svg>
  );
}
