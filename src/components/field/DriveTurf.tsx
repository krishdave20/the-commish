import { useMemo, useState } from 'react';
import { Avatar } from '../Avatar';
import { Football } from '../art/Football';
import { Turf } from '../art/Turf';
import { momentum, placePlays, playContext, playText, signedPoints } from './drive';
import type { DrivePlay, PlacedPlay } from './drive';
import './field.css';

interface Props {
  plays: readonly DrivePlay[];
  meName: string;
  oppName: string;
  /** yours minus your opponent's on the scoreboard now; null hides the momentum line */
  margin: number | null;
  /** live: the feed so far, newest highlighted; top: the week's top scoring plays after the fact (no newest, no momentum) */
  mode?: 'live' | 'top';
}

/** The drive chart on a turf football field. Each scoring update is a football on the field in time order, from the left end zone to the right: green
    for your team, warm red for your opponent, small and pale for everyone else, bigger for more points, hollow for a correction. The newest play has a
    short drive arrow pushing into it (still under reduced motion). A thin line across the field is the running margin: above midfield you are ahead.
    Tap, hover or focus a play to read "+6.4 · ja'marr chase · cin vs pit · q3 8:12". Each play is a button whose visible text is its points; the
    player, game and clock follow as screen-reader text. */
export function DriveTurf({ plays, meName, oppName, margin, mode = 'live' }: Props) {
  const placed = useMemo(() => placePlays(plays), [plays]);
  const line = useMemo(() => (margin === null || mode === 'top' ? [] : momentum(plays, margin)), [plays, margin, mode]);
  // hovering or focusing a play reads it; a tap pins it until the next tap (or Escape), which is how a touch screen reads one
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const active = hover ?? pinned;
  const latest = mode === 'live' && placed.length ? placed[placed.length - 1]! : null;
  const sel: PlacedPlay | null = placed.find((p) => p.play.id === active) ?? null;
  const count = (side: 'me' | 'opp' | 'other') => plays.filter((p) => p.side === side).length;
  const summary = `${plays.length} ${mode === 'top' ? 'top scoring plays' : plays.length === 1 ? 'scoring update' : 'scoring updates'}, oldest at the left end zone: ${meName} ${count('me')}, ${oppName} ${count('opp')}, the rest of the league ${count('other')}`;
  const ahead = margin === null ? null : margin > 0.005 ? `${meName} ahead by ${margin.toFixed(1)}` : margin < -0.005 ? `${oppName} ahead by ${Math.abs(margin).toFixed(1)}` : 'level';
  return (
    <figure className="dt" data-mode={mode} onKeyDown={(e) => { if (e.key === 'Escape') setPinned(null); }}>
      <div className="dt-field">
        <Turf leftName={meName} rightName={oppName} className="dt-turf">
          {line.length > 1 && (
            <svg className="dt-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <path className="dt-mid" d="M0 50H100" />
              <polyline className="dt-margin" points={line.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')} />
            </svg>
          )}
          {latest && (
            <svg className="dt-drive" style={{ left: `${latest.x}%`, top: `${latest.y}%`, marginLeft: `${-latest.size / 2 - 30}px` }} viewBox="0 0 28 8" aria-hidden="true" focusable="false">
              <path d="M1 4H25M21 1L25 4L21 7" fill="none" />
            </svg>
          )}
          {placed.map((p) => {
            const big = p.play.side !== 'other' && Math.abs(p.play.points) >= 5;
            const show = p === latest || active === p.play.id || big;
            const w = p.size, h = Math.round(w * 0.67);
            return (
              <button
                key={p.play.id} type="button" className="dt-mark"
                data-side={p.play.side} data-neg={p.play.points < 0 ? 'true' : undefined} data-latest={p === latest ? 'true' : undefined} data-active={active === p.play.id ? 'true' : undefined}
                style={{ left: `${p.x}%`, top: `${p.y}%`, width: w, height: h }}
                onMouseEnter={() => setHover(p.play.id)} onMouseLeave={() => setHover((a) => (a === p.play.id ? null : a))}
                onFocus={() => setHover(p.play.id)} onBlur={() => setHover((a) => (a === p.play.id ? null : a))}
                onClick={() => setPinned((a) => (a === p.play.id ? null : p.play.id))}
              >
                <Football size={w} className="dt-ball" />
                <span className={show ? 'dt-pts' : 'sr-only'}>{signedPoints(p.play.points)}</span>{' '}
                <span className="sr-only">{playContext(p.play)}</span>
              </button>
            );
          })}
        </Turf>
        {sel && (
          <div className="dt-tip" aria-hidden="true" style={{ left: `${Math.max(14, Math.min(86, sel.x))}%`, top: `${sel.y}%` }} data-below={sel.y < 40 ? 'true' : undefined}>
            {sel.play.pid && <Avatar pid={sel.play.pid} name={sel.play.name} pos={sel.play.pos} team={sel.play.nfl ?? undefined} size={20} className="dt-tip-av" />}
            <span className="dt-tip-text">{playText(sel.play)}</span>
          </div>
        )}
      </div>
      <figcaption className="dt-key">
        <span className="sr-only">{summary}.</span>
        <span data-key="me">{meName}</span><span data-key="opp">{oppName}</span><span data-key="other">rest of the league</span>
        {line.length > 1 && ahead && <span className="dt-ahead">line: {ahead}, above the midline is {meName}</span>}
        <span className="dt-dir">oldest to newest, left to right</span>
      </figcaption>
    </figure>
  );
}
