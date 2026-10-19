import { useEffect, useRef } from 'react';
import { centerScrollLeft } from './weekRange';

interface Props {
  weeks: readonly number[];
  value: number;
  currentWeek: number;
  /** the first playoff week; chips from there on are marked */
  playoffStart?: number | null;
  onSelect: (week: number) => void;
}

/** A compact row of week chips with previous and next arrows. The row scrolls sideways (snapping) and keeps the chosen week in the middle; every chip and
    arrow is a 44 px target on a phone. The current week carries a dot. */
export function WeekPicker({ weeks, value, currentWeek, playoffStart = null, onSelect }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const chip = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const b = box.current, c = chip.current;
    if (!b || !c || typeof b.scrollTo !== 'function') return;
    b.scrollTo({ left: centerScrollLeft({ width: b.clientWidth, scrollWidth: b.scrollWidth }, { left: c.offsetLeft, width: c.offsetWidth }) });
  }, [value, weeks.length]);
  const i = weeks.indexOf(value);
  return (
    <div className="gd-weeks" role="group" aria-label="week">
      <button type="button" className="gd-week-arrow" aria-label="previous week" disabled={i <= 0} onClick={() => onSelect(weeks[i - 1]!)}><span aria-hidden="true">‹</span></button>
      <div className="gd-week-scroll" ref={box}>
        {weeks.map((w) => (
          <button
            key={w} type="button" className="gd-week-chip" ref={w === value ? chip : undefined}
            aria-current={w === value ? 'true' : undefined} data-current-week={w === currentWeek ? 'true' : undefined} data-playoff={playoffStart !== null && w >= playoffStart ? 'true' : undefined}
            onClick={() => onSelect(w)}
          >
            <span aria-hidden="true">{w}</span>
            <span className="sr-only">{`week ${w}${w === currentWeek ? ' (this week)' : ''}${playoffStart !== null && w >= playoffStart ? ' (playoffs)' : ''}`}</span>
          </button>
        ))}
      </div>
      <button type="button" className="gd-week-arrow" aria-label="next week" disabled={i < 0 || i >= weeks.length - 1} onClick={() => onSelect(weeks[i + 1]!)}><span aria-hidden="true">›</span></button>
    </div>
  );
}
