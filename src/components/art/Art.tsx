import { useId } from 'react';
import type { ReactNode } from 'react';
import '../../styles/art.css';

/** What every illustration takes. `title` makes it a labelled image; without one it is decorative and hidden from assistive tech. */
export interface ArtProps {
  /** rendered width in px; the height follows the drawing's proportions */
  size?: number;
  title?: string;
  className?: string;
}

interface BaseProps extends ArtProps {
  /** the drawing's own grid */
  w: number;
  h: number;
  defaultSize: number;
  children: ReactNode;
}

/** The one frame for the set: fine ink line art, round caps and joins, 1.4 px lines that stay 1.4 px at any size (see art.css). */
export function Art({ w, h, size, defaultSize, title, className, children }: BaseProps) {
  const id = useId();
  const width = size ?? defaultSize;
  return (
    <svg
      className={className ? `art ${className}` : 'art'} viewBox={`0 0 ${w} ${h}`} width={width} height={Math.round((width * h * 100) / w) / 100}
      fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" focusable="false"
      {...(title ? { role: 'img', 'aria-labelledby': id } : { 'aria-hidden': true })}
    >
      {title && <title id={id}>{title}</title>}
      {children}
    </svg>
  );
}
