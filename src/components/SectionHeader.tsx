import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';

interface Props {
  /** the id the section's `aria-labelledby` points at */
  id: string;
  title: string;
  /** a quiet line above the title; keep it only when it says something the title does not */
  kicker?: ReactNode;
  /** a note behind a "?" beside the title (method, definitions, how to read it) */
  tip?: ReactNode;
  /** a link or small control at the right of the title row ("all 12 →") */
  action?: ReactNode;
  level?: 2 | 3;
}

/** The one section header: optional kicker, the title with its "?" and a note that opens below it, and an optional action at the right. */
export function SectionHeader({ id, title, kicker, tip, action, level = 2 }: Props) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <header>
      {kicker && <div className="micro">{kicker}</div>}
      <div className={action ? 'row between' : undefined}>
        <div className="title-row">
          <H id={id}>{title}</H>
          {tip && <InfoTip label={title}>{tip}</InfoTip>}
        </div>
        {action}
      </div>
    </header>
  );
}
