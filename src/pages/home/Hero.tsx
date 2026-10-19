import { useMemo } from 'react';
import { useLiveMaybe } from '../../app/live/liveContext';
import { useMoments } from '../../app/moments/momentsContext';
import { AvatarStack } from '../../components/Avatar';
import type { TeamLive } from '../../engine/live';
import '../../styles/moments.css';

/** The three starters who matter most on a side: the highest live projections. */
const topThree = (t: TeamLive) => t.starters.slice().sort((a, b) => b.projection - a.projection).slice(0, 3).map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.nfl ?? undefined }));

/** The sentence at the top of the huddle: where you stand, in words and large type, with the odds in plain language and, when the live
    layer knows both lineups, the three biggest starters on each side. */
export function HuddleHero() {
  const { hero } = useMoments();
  const live = useLiveMaybe();
  const mine = live && !live.replay ? live.view?.mine ?? null : null;
  const sides = useMemo(() => (mine ? { a: topThree(mine.a), b: topThree(mine.b) } : null), [mine]);
  if (!hero) return null;
  return (
    <section className="hero" aria-label="this week in a sentence" data-kind={hero.kind}>
      <p className="hero-line">{hero.sentence}</p>
      {sides && (hero.kind === 'live' || hero.kind === 'pre' || hero.kind === 'final') && sides.a.length > 0 && sides.b.length > 0 && (
        <div className="hero-sides">
          <AvatarStack players={sides.a} size={40} max={3} label="your top starters" />
          <span className="hero-vs" aria-hidden="true">vs</span>
          <AvatarStack players={sides.b} size={40} max={3} label="their top starters" />
        </div>
      )}
      {hero.odds && <p className="hero-odds">{hero.odds}</p>}
    </section>
  );
}
