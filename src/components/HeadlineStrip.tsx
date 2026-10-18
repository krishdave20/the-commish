import type { ReactNode } from 'react';
import { Kpi } from './Kpi';

export interface HeadlineItem {
  label: string;
  /** the big serif figure (a `CountUp` is welcome) */
  value: ReactNode;
  sub?: ReactNode;
}

interface Props {
  /** accessible name: "your season", "this week" */
  label: string;
  /** two to four figures: the numbers that answer the page's question */
  items: HeadlineItem[];
}

/** The slim row at the top of a page: 2 to 4 figures, no box. Built from `Kpi`, so the figures count up the same way. */
export function HeadlineStrip({ label, items }: Props) {
  return (
    <div className="strip" role="group" aria-label={label}>
      {items.map((it) => <Kpi key={it.label} label={it.label} sub={it.sub}>{it.value}</Kpi>)}
    </div>
  );
}
