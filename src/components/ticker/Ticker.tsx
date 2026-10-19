import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveMaybe } from '../../app/live/liveContext';
import { useMatchupPillShowing } from '../live-activity/pillStore';
import { useWantsReducedMotion } from '../motion';
import { LiveDot } from './LiveDot';
import { nflItems, pinnedItem, tickerItems } from './items';
import type { NflItem, TickerItem } from './items';
import { useTickerMode } from './useTickerMode';
import { useTickerCollapsed } from './useTickerPref';
import './ticker.css';

/* The visible text is the link's name; what position and colour say (who is favoured, who leads, that a game is live) follows in
   screen-reader-only text. No aria-label anywhere: a label that differs from the visible words breaks voice control. */
function sayTail(it: TickerItem) {
  return it.pct ? `, ${it.fav === 'left' ? it.left : it.right} ${it.pct} to win` : it.lead ? `, ${it.lead === 'left' ? it.left : it.right} won` : ', tied';
}

function Item({ it }: { it: TickerItem }) {
  return (
    <li className="tk-li">
      <Link to={`/gameday?m=${it.matchupId}`} className="tk-item" data-mine={it.mine ? 'true' : undefined}>
        {it.pct && it.fav === 'left' && <><span className="tk-pct" data-tone={it.pctTone}>{it.pct}</span>{' '}</>}
        <span className="tk-team" data-lead={it.lead === 'left' ? 'true' : undefined}>{it.left}</span>{' '}
        <span className="tk-score" data-lead={it.lead === 'left' ? 'true' : undefined}>{it.leftScore}</span>{' '}
        <span className="tk-dash">–</span>{' '}
        <span className="tk-score" data-lead={it.lead === 'right' ? 'true' : undefined}>{it.rightScore}</span>{' '}
        <span className="tk-team" data-lead={it.lead === 'right' ? 'true' : undefined}>{it.right}</span>{' '}
        {it.pct && it.fav === 'right' && <><span className="tk-pct" data-tone={it.pctTone}>{it.pct}</span>{' '}</>}
        <span className="tk-note">{it.note}</span>
        {' '}<span className="sr-only">{sayTail(it)}</span>
      </Link>
    </li>
  );
}

/** My own matchup, pinned at the left of the bar: "live · icemen 95.0 [win bar] killa k 58.8 · 82%". */
function Pinned({ it, status, live }: { it: TickerItem; status: string; live: boolean }) {
  return (
    <Link to={`/gameday?m=${it.matchupId}`} className="tk-pin" data-live={live ? 'true' : undefined}>
      <span className="tk-tag">{live && <LiveDot />}{status}</span>{' '}
      <span className="tk-team" data-lead={it.lead === 'left' ? 'true' : undefined}>{it.left}</span>{' '}
      <span className="tk-score" data-lead={it.lead === 'left' ? 'true' : undefined}>{it.leftScore}</span>{' '}
      <span className="tk-mini" aria-hidden="true"><i style={{ width: `${Math.round(it.winLeft * 100)}%` }} /></span>{' '}
      <span className="tk-score" data-lead={it.lead === 'right' ? 'true' : undefined}>{it.rightScore}</span>{' '}
      <span className="tk-team" data-lead={it.lead === 'right' ? 'true' : undefined}>{it.right}</span>{' '}
      {it.pct && <><span className="tk-dash">·</span>{' '}<span className="tk-pct" data-tone={it.pctTone}>{it.pct}</span>{' '}</>}
      <span className="sr-only">{sayTail(it)}{it.projected ? ', projected' : ''}</span>
    </Link>
  );
}

function Game({ g }: { g: NflItem }) {
  return (
    <li className="tk-li">
      <Link to={`/nfl?game=${encodeURIComponent(g.id)}`} className="tk-item tk-game" data-state={g.state} data-mine={g.mine ? 'true' : undefined}>
        {g.live && <><LiveDot />{' '}</>}
        <span className="tk-gscore">{g.score}</span>{' '}
        <span className="tk-dash">·</span>{' '}
        <span className="tk-gstat" data-state={g.state}>{g.status}</span>
        {' '}<span className="sr-only">{`, ${g.label}`}</span>
      </Link>
    </li>
  );
}

/** The slim score bar across the top of every page, a dark band: my live matchup pinned at the left (on a phone, only while the live activity pill is not showing it),
    then a scrolling rotation in two labelled segments, "your league" (the other matchups) and "nfl" (live games first, then finals, then the kickoffs still to come). It stops on hover or
    focus, and is a plain scrollable strip with reduced motion. It folds away (remembered on this device). Only my own score changes are announced. */
export function Ticker() {
  const live = useLiveMaybe();
  const mode = useTickerMode();
  const reduced = useWantsReducedMotion();
  const [collapsed, setCollapsed] = useTickerCollapsed();
  const [held, setHeld] = useState(false);
  const [announce, setAnnounce] = useState('');
  // on a phone the live activity pill, up in the top bar, is showing my live matchup: the ticker leaves its own pinned copy out and keeps the rest
  const pillHasMine = useMatchupPillShowing();
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

  const games = live?.snapshot?.gamesKnown ? live.snapshot.games : null;
  const starters = useMemo(() => {
    const m = new Map<string, number>();
    const me = mine ? (mine.a.isMe ? mine.a : mine.b) : null;
    for (const s of me?.starters ?? []) if (s.nfl) m.set(s.nfl, (m.get(s.nfl) ?? 0) + 1);
    return m;
  }, [mine]);
  const nfl = useMemo(() => (games ? nflItems(games, starters) : []), [games, starters]);

  // the band is kept open, empty, while the scores load (it was on last time), so nothing below it jumps
  if (mode === 'hold') return <section className="ticker" aria-hidden="true" data-hold="true" />;
  if (!live || !live.available || !view || view.matchups.length === 0) return null;

  const pin = pillHasMine ? null : pinnedItem(view);
  const items = tickerItems(view);
  const chars = items.reduce((n, i) => n + i.left.length + i.right.length + 28, 0) + nfl.reduce((n, g) => n + g.text.length + 4, 0) + 24;
  const dur = Math.max(30, Math.round(chars * 0.22));
  const status = live.replay ? 'replay' : live.live ? 'live' : live.phase === 'final' ? 'final' : `week ${live.week}`;

  const half = (hidden: boolean) => (
    <div className="tk-half" aria-hidden={hidden || undefined} {...(hidden ? { inert: true } : {})}>
      {items.length > 0 && (
        <div className="tk-seg" data-kind="league">
          <ul aria-label="your league scores">
            <li className="tk-label" aria-hidden="true">your league</li>
            {items.map((it) => <Item key={it.key} it={it} />)}
          </ul>
        </div>
      )}
      {items.length > 0 && nfl.length > 0 && <span className="tk-split" aria-hidden="true" />}
      {nfl.length > 0 && (
        <div className="tk-seg" data-kind="nfl">
          <ul aria-label="nfl scores">
            <li className="tk-label" aria-hidden="true">nfl</li>
            {nfl.map((g) => <Game key={g.key} g={g} />)}
          </ul>
        </div>
      )}
      <span className="tk-split" aria-hidden="true" />
    </div>
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
          {pin
            ? <Pinned it={pin} status={status} live={live.live} />
            : <span className="tk-tag" data-replay={live.replay ? 'true' : undefined}>{live.live && <LiveDot />}{status}</span>}
          <div className="tk-view">
            <div className="tk-track" style={{ ['--tk-dur' as string]: `${dur}s` }}>
              {half(false)}
              {!reduced && half(true)}
            </div>
          </div>
          <button type="button" className="tk-close" onClick={() => setCollapsed(true)} aria-expanded="true" aria-label="hide scores">hide</button>
        </div>
      )}
    </section>
  );
}
