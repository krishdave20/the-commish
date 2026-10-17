import { Link } from 'react-router-dom';
import { FEATURE, PAGES } from '../../app/names';
import { currentDraft } from '../../app/phase';
import { slotOfUser } from '../../engine';
import type { LeagueBundle } from '../../data';

/** Draft day: an on-the-clock banner that jumps to the draft room and its live assistant. */
export function Drafting({ bundle, userId }: { bundle: LeagueBundle; userId: string | null }) {
  const draft = currentDraft(bundle.league, bundle.drafts);
  const slot = draft && userId ? slotOfUser(draft, userId) : null;
  return (
    <section className="banner" aria-labelledby="clock-title">
      <div className="micro">{draft?.status === 'paused' ? 'the draft is paused' : 'the draft is live'}</div>
      <h2 id="clock-title">{FEATURE.onTheClock}</h2>
      <p>{slot !== null ? `you pick from slot ${slot}. ` : ''}head to the {PAGES.draft.name} to follow the board.</p>
      <Link className="btn solid" to={PAGES.draft.path}>open the {PAGES.draft.name}</Link>
      <p className="note"><Link to={`${PAGES.draft.path}?tab=clock`}>open {FEATURE.onTheClock} →</Link></p>
    </section>
  );
}
