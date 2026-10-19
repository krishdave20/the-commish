import { formatNum, formatPoints1, ordinal, signed } from '../../../app/format';
import { AvatarName } from '../../../components/Avatar';
import { Drawer } from '../../../components/Drawer';
import { PlayerLink } from '../../../components/PlayerLink';
import { showLetter } from '../../../engine/draft/grades.ts';
import type { PickGrade, TeamGrade } from '../../../engine/draft/grades.ts';
import { ordinalPick, teamLabel } from '../model';
import type { DraftRoom } from '../model';
import { LetterChip } from './LetterChip';

interface Props {
  grade: TeamGrade | null;
  room: DraftRoom;
  onClose: () => void;
}

const pts = (n: number) => signed(n, 0);

/** One team's whole draft: the grades, then every pick with its ADP gap, points so far, rest of season and whether the team still has him. */
export function TeamGradeDrawer({ grade, room, onClose }: Props) {
  if (!grade) return null;
  const teams = room.teams;
  const info = teams.get(grade.rosterId);
  const slotOf = (p: PickGrade) => ordinalPick(p.round, p.slot);
  const where = (p: PickGrade) => (p.status === 'kept' ? 'still rostered' : p.status === 'traded' ? `traded to ${teamLabel(teams, p.ownerRid)}` : 'dropped');
  const { mvp, best, worst, gotAway } = grade;
  const dd = grade.draftDay, hs = grade.hindsight;

  return (
    <Drawer
      open onClose={onClose} title={info?.team ?? `team ${grade.rosterId}`}
      kicker={`${info?.manager ?? ''}${info?.mine ? ' · you' : ''} · ${showLetter(dd.letter)} → ${showLetter(hs.letter)}`}
    >
      <div className="dg-grades">
        <div className="stat"><span className="micro">draft day (approximate)</span><span className="v"><LetterChip letter={dd.letter} label="draft day grade" /> <span className="dim dg-sm">{ordinal(dd.rank)} · vor {formatPoints1(dd.vor)}</span></span></div>
        <div className="stat"><span className="micro">hindsight</span><span className="v"><LetterChip letter={hs.letter} label="hindsight grade" /> <span className="dim dg-sm">{ordinal(hs.rank)} · <span className={hs.overExp >= 0 ? 'pos-c' : 'neg-c'}>{pts(hs.overExp)}</span> pts</span></span></div>
        <div className="stat"><span className="micro">still rostered</span><span className="v">{grade.kept}<span className="dim">/{grade.picks.length}</span> <span className="dim dg-sm">{grade.traded} traded · {grade.dropped} dropped</span></span></div>
      </div>

      <ul className="plain dg-notes">
        {mvp && <li><span className="micro">team mvp</span> <PlayerLink pid={mvp.pid} name={mvp.name} /> <span className="dim">{mvp.pos.toLowerCase()} · pick {mvp.pickNo} · {formatPoints1(mvp.total)} pts</span></li>}
        {best && best.overExp > 0 && <li><span className="micro">best pick</span> <PlayerLink pid={best.pid} name={best.name} /> <span className="pos-c">{pts(best.overExp)}</span></li>}
        {worst && worst.overExp < 0 && <li><span className="micro">biggest miss</span> <PlayerLink pid={worst.pid} name={worst.name} /> <span className="neg-c">{pts(worst.overExp)}</span></li>}
        {gotAway && (
          <li>
            <span className="micro">the one that got away</span> <PlayerLink pid={gotAway.theirs.pid} name={gotAway.theirs.name} />{' '}
            <span className="dim">went at {gotAway.theirs.pickNo}, {pts(gotAway.gap)} pts more than {gotAway.mine.name}</span>
          </li>
        )}
      </ul>

      <section aria-label={`Every pick by ${info?.team ?? 'this team'}`}>
        <h3>every pick</h3>
        <ol className="dg-picks">
          {grade.picks.map((p) => (
            <li key={p.pickNo} className="dg-pick" data-status={p.status}>
              <span className="dg-no dim" title={`round ${p.round}, slot ${p.slot}: overall pick ${p.pickNo}`}>{slotOf(p)}<span className="dg-ov">#{p.pickNo}</span></span>
              <AvatarName pid={p.pid} name={p.name} pos={p.pos} team={p.nfl ?? undefined} size={20}>
                <PlayerLink pid={p.pid} name={p.name} /> <span className="dim">{p.pos.toLowerCase()}</span>
              </AvatarName>
              <span className={`n ${p.overExp >= 0 ? 'pos-c' : 'neg-c'}`} title="points over what this slot usually returns">{pts(p.overExp)}</span>
              <span className="dg-det dim">
                vs adp {p.valueVsAdp == null ? '—' : <span className={p.valueVsAdp > 0 ? 'pos-c' : p.valueVsAdp < 0 ? 'neg-c' : undefined}>{signed(p.valueVsAdp, 1)}</span>}
                {' · '}{formatNum(p.toDate)} so far{' · '}{p.ros == null ? 'no rest-of-season' : `${formatNum(p.ros)} ros`}{' · '}{where(p)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </Drawer>
  );
}
