import { Link, useLocation } from 'react-router-dom';
import { MomentsScope } from '../app/moments/MomentsProvider';
import { useMoments } from '../app/moments/momentsContext';
import { momentFor, spanWords } from '../engine/moments';
import type { MomentPage } from '../engine/moments';
import '../styles/moments.css';

function Banner({ page }: { page: MomentPage }) {
  const { moments, now } = useMoments();
  const here = useLocation().pathname;
  const m = momentFor(moments, page);
  if (!m) return null;
  const left = m.countdownTo !== undefined && m.countdownTo > now ? spanWords(m.countdownTo - now) : null;
  // the link is for going somewhere: not to the page you are already on
  const goes = m.action.to.split('?')[0] !== here;
  return (
    <aside className="mb" aria-label="right now" data-live={m.live ? 'true' : undefined}>
      <span className="mb-dot" aria-hidden="true" />
      <p className="mb-line">
        <strong>{m.title}</strong>
        {left && <span className="mb-left"> · {left} left</span>}
        <span className="mb-detail"> · {m.detail}</span>
      </p>
      {goes && <Link className="mb-go" to={m.action.to}><span className="mb-go-text">{m.action.label}</span> <span className="mb-go-arrow">→</span></Link>}
    </aside>
  );
}

/** A slim line at the top of a page with the one moment that matters to it right now ("waivers process tonight at 2:00 am · 14h left"),
    and a link to act on it. Hidden when nothing is relevant. */
export function MomentBanner({ page }: { page: MomentPage }) {
  return <MomentsScope lite><Banner page={page} /></MomentsScope>;
}
