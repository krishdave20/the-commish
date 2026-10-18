const CREDIT = {
  sleeper: 'league data: sleeper public api',
  nflverse: 'play-by-play and snap data: nflverse; charting data: ftn data via nflverse',
  fantasycalc: 'values: fantasycalc',
} as const;

export type Source = keyof typeof CREDIT;

/** The credit line for the data a page uses. Every page that shows nflverse or FantasyCalc numbers carries one. */
export function Attribution({ sources }: { sources: Source[] }) {
  return <p className="note attribution">{sources.map((s) => CREDIT[s]).join(' · ')}.</p>;
}
