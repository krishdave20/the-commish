import { useState } from 'react';
import type { CardSpec } from '../../engine/share';
import { ShareSheet } from './ShareSheet';
import '../../styles/share.css';

const NOUN: Record<CardSpec['kind'], string> = {
  matchup: 'this matchup', take: 'this take', bracket: 'this bracket', grade: 'this draft grade', huddle: 'this week',
};

/** The iOS-style share glyph in the app's hand: a tray and an arrow, 1.6 px line, round caps. */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 15V4M8.5 7.5L12 4l3.5 3.5" />
      <path d="M7 10.5H6a1.5 1.5 0 0 0-1.5 1.5v6.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V12A1.5 1.5 0 0 0 18 10.5h-1" />
    </svg>
  );
}

interface Props {
  /** the card as plain data; build it where the numbers are */
  card: CardSpec;
  className?: string;
}

/** "share": one tap turns this moment into an image for the group chat. Opens a sheet with a preview, then share, save image or copy image. */
export function ShareButton({ card, className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button" className={`btn quiet share-btn${className ? ` ${className}` : ''}`} aria-haspopup="dialog"
        aria-label={`share ${NOUN[card.kind]}`} title="make an image to send to the group chat" onClick={() => setOpen(true)}
      >
        <ShareIcon /><span>share</span>
      </button>
      {open && <ShareSheet spec={card} open onClose={() => setOpen(false)} />}
    </>
  );
}
