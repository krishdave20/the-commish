import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveMaybe } from '../../app/live/liveContext';
import { useWantsReducedMotion } from '../motion';
import { LiveDot } from './LiveDot';
import { nflItems, tickerItems } from './items';
import type { TickerItem } from './items';
import { useTickerCollapsed } from './useTickerPref';
import './ticker.css';

function Item({ it }: { it: TickerItem }) {
  return (
    <li className="tk-li">
      <Link
        to={`/gameday?m=${it.matchupId}`} className="tk-item" data-mine={it.mine ? 'true' : undefined}
      >
        {it.pct && it.fav === 'left' && <><span className="tk-pct" data-tone={it.pctTone}>{it.pct}</span>{' '}</>}
        <span className="tk-team" data-lead={it.lead === 'left' ? 'true' : undefined}>{it.left}</span>{' '}
        <span className="tk-score" data-lead={it.lead === 'left' ? 'true' : undefined}>{it.leftScore}</span>{' '}
        <span className="tk-dash">–</span>{' '}
        <span className="tk-score" data-lead={it.lead === 'right' ? 'true' : undefined}>{it.rightScore}</span>{' '}
        <span className="tk-team" data-lead={it.lead === 'right' ? 'true' : undefined}>{it.right}</span>{' '}
        {it.pct && it.fav === 'right' && <><span className="tk-pct" data-tone={it.pctTone}>{it.pct}</span>{' '}</>}
        <span className="tk-note">{it.note}</span>
        {/* the visible text is the name; this only adds what the layout says with position and colour */}
        {' '}<span className="sr-only">{it.pct ? `, ${it.fav === 'left' ? it.left : it.right} ${it.pct} to win` : it.lead ? `, ${it.lead === 'left' ? it.left : it.right} won` : ', tied'}</span>
      </Link>
    </li>
  );
}

/** The slim score bar across the top of every page: this week's league matchups, mine first, scrolling gently.
    It stops on hover or focus, and is a plain scrollable strip with reduced motion. It folds away (remembered on this device).
    Only my own score changes are announced to screen readers. */
export function Ticker() {
  const live = useLiveMaybe();
  const reduced = useWantsReducedMotion();
  const [collapsed, setCollapsed] = useTickerCollapsed();
  const [held, setHeld] = useState(false);
  const [announce, setAnnounce] = useState('');
  const last = useRef<string | null>(null);

  const view = live?.view ?? null;
  const mine = view?.mine ?? null;
  // announce only my matchup, and only when the points change
  useEffect(() => {
    if (!mine) return;
    const key = `${mine.a.actual}|${mine.b.actual}`;
    if (last.current !== null && last.current !== key) {
      setAnnounce(`${mine.a.name} ${mine.a.actual.toFixed(1)}, ${mine.b.name} ${mine.b.actual.toFixed(1)}`);
    }
    last.current = key;
  }, [mine]);

  if (!live || !live.available || !view || view.matchups.length === 0) return null;

  const items = tickerItems(view);
  const nfl = live.snapshot?.gamesKnown ? nflItems(live.snapshot.games) : [];
  const chars = items.reduce((n, i) => n + i.left.length + i.right.length + 28, 0) + nfl.reduce((n, g) => n + g.text.length + 4, 0);
  const dur = Math.max(30, Math.round(chars * 0.22));
  const status = live.replay ? 'replay' : live.live ? 'live' : live.phase === 'final' ? 'final' : `week ${live.week}`;

  const list = (hidden: boolean) => (
    <ul className="tk-half" aria-hidden={hidden || undefined} {...(hidden ? { inert: true } : {})}>
      {items.map((it) => <Item key={it.key} it={it} />)}
      {nfl.length > 0 && <li className="tk-sep" aria-hidden="true" />}
      {nfl.map((g) => <li key={g.key} className="tk-nfl" data-live={g.live ? 'true' : undefined}>{g.text}</li>)}
    </ul>
  );

  return (
    <section
      className="ticker" aria-label="league scores" data-collapsed={collapsed ? 'true' : undefined}
      data-motion={reduced ? 'reduced' : 'ok'} data-held={held ? 'true' : undefined}
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
    >
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {collapsed ? (
        <button type="button" className="tk-open" onClick={() => setCollapsed(false)} aria-expanded="false">
          {live.live && <LiveDot />}show scores
        </button>
      ) : (
        <div className="tk-bar">
          <span className="tk-tag" data-replay={live.replay ? 'true' : undefined}>
            {live.live && <LiveDot />}{status}
          </span>
          <div className="tk-view">
            <div className="tk-track" style={{ ['--tk-dur' as string]: `${dur}s` }}>
              {list(false)}
              {!reduced && list(true)}
            </div>
          </div>
          <button type="button" className="tk-close" onClick={() => setCollapsed(true)} aria-expanded="true" aria-label="hide scores">hide</button>
        </div>
      )}
    </section>
  );
}
