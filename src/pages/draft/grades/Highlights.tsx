import { signed } from '../../../app/format';
import { AvatarName } from '../../../components/Avatar';
import { Disclosure } from '../../../components/Disclosure';
import { PlayerLink } from '../../../components/PlayerLink';
import { SectionHeader } from '../../../components/SectionHeader';
import type { DraftGrades, PickGrade } from '../../../engine/draft/grades.ts';

interface Props {
  grades: DraftGrades;
  teamName: (rid: number) => string;
}

const pts = (n: number) => signed(n, 0);

function Who({ p, teamName, line }: { p: PickGrade; teamName: (rid: number) => string; line?: string }) {
  return (
    <AvatarName pid={p.pid} name={p.name} pos={p.pos} team={p.nfl ?? undefined} size={20}>
      <PlayerLink pid={p.pid} name={p.name} />
      <span className="dim hl-sub">{line ?? `${p.pos.toLowerCase()} · ${teamName(p.rosterId)} · pick ${p.pickNo}`}</span>
    </AvatarName>
  );
}

/** Compact cards: the league's steals and busts, the best pick of every round, and the picks that got away. Each is a rule over the numbers in the table. */
export function Highlights({ grades, teamName }: Props) {
  const gotAway = grades.teams
    .flatMap((t) => (t.gotAway ? [{ rid: t.rosterId, ...t.gotAway }] : []))
    .sort((a, b) => b.gap - a.gap || a.mine.pickNo - b.mine.pickNo)
    .slice(0, 3);
  const rounds = grades.bestByRound;

  return (
    <section className="card" aria-labelledby="hl-title">
      <SectionHeader
        id="hl-title" title="highlights"
        tip="steals and busts are the most and fewest points over what a pick in that slot returned. the one that got away is the biggest gap between a team’s pick and a same-position player taken within the next round of picks by another team."
      />
      <div className="hl-grid">
        <div className="hl-card" aria-label="biggest steals">
          <h3>biggest steals</h3>
          {grades.steals.length === 0 ? <p className="note">no pick has beaten its slot yet.</p> : (
            <ul className="plain">
              {grades.steals.map((p) => (
                <li key={p.pickNo} className="hl-row"><Who p={p} teamName={teamName} /><span className="pos-c n">{pts(p.overExp)}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="hl-card" aria-label="biggest busts">
          <h3>biggest busts</h3>
          {grades.busts.length === 0 ? <p className="note">no pick has fallen short of its slot yet.</p> : (
            <ul className="plain">
              {grades.busts.map((p) => (
                <li key={p.pickNo} className="hl-row"><Who p={p} teamName={teamName} /><span className="neg-c n">{pts(p.overExp)}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="hl-card" aria-label="best pick of each round">
          <h3>best pick of each round</h3>
          <ul className="plain">
            {rounds.slice(0, 5).map(({ round, pick }) => (
              <li key={round} className="hl-row"><Who p={pick} teamName={teamName} line={`round ${round} · ${teamName(pick.rosterId)}`} /><span className={`${pick.overExp >= 0 ? 'pos-c' : 'neg-c'} n`}>{pts(pick.overExp)}</span></li>
            ))}
          </ul>
          {rounds.length > 5 && (
            <Disclosure title={`rounds 6 to ${rounds.length}`} inline level={3}>
              <ul className="plain">
                {rounds.slice(5).map(({ round, pick }) => (
                  <li key={round} className="hl-row"><Who p={pick} teamName={teamName} line={`round ${round} · ${teamName(pick.rosterId)}`} /><span className={`${pick.overExp >= 0 ? 'pos-c' : 'neg-c'} n`}>{pts(pick.overExp)}</span></li>
                ))}
              </ul>
            </Disclosure>
          )}
        </div>
        <div className="hl-card" aria-label="the one that got away">
          <h3>the one that got away</h3>
          {gotAway.length === 0 ? <p className="note">nobody’s pick was beaten by a same-position player taken right after.</p> : (
            <ul className="plain">
              {gotAway.map((g) => (
                <li key={g.rid} className="hl-away">
                  <span className="hl-sub">{teamName(g.rid)} took <PlayerLink pid={g.mine.pid} name={g.mine.name} /> at {g.mine.pickNo}</span>
                  <Who p={g.theirs} teamName={teamName} line={`went at ${g.theirs.pickNo} · ${pts(g.gap)} pts more`} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
