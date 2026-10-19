import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** accessible name for the group */
  label: string;
}

/** The `.seg` control: one choice from a few. Arrow keys move and select; Home and End jump. */
export function Segmented<T extends string | number>({ options, value, onChange, label }: Props<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const strip = useRef<HTMLDivElement>(null);
  const current = options.findIndex((o) => o.value === value);

  // a strip that scrolls sideways (a phone) keeps the chosen option in view. Only the strip moves, never the page.
  useEffect(() => {
    const box = strip.current;
    const btn = refs.current[current];
    if (!box || !btn || box.scrollWidth <= box.clientWidth) return;
    box.scrollLeft = btn.offsetLeft - (box.clientWidth - btn.offsetWidth) / 2;
  }, [current]);

  function move(to: number) {
    const n = options.length;
    if (n === 0) return;
    const i = ((to % n) + n) % n;
    onChange(options[i].value);
    refs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const at = current < 0 ? 0 : current;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': e.preventDefault(); move(at + 1); break;
      case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); move(at - 1); break;
      case 'Home': e.preventDefault(); move(0); break;
      case 'End': e.preventDefault(); move(options.length - 1); break;
    }
  }

  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKeyDown} ref={strip}>
      {options.map((o, i) => {
        const on = i === current;
        return (
          <button
            key={String(o.value)} type="button" role="radio" aria-checked={on}
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            ref={(el) => { refs.current[i] = el; }}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
