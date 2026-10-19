import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ordinal } from '../../../app/format';
import { SectionHeader } from '../../../components/SectionHeader';
import { Segmented } from '../../../components/Segmented';
import type { Engine } from '../../../engine';
import { bumpData, buildPowerRankings, topPlayers, weightsFor } from '../../../engine/power';
import type { PowerTeamWeek } from '../../../engine/power';
import { BumpChart } from './BumpChart';
import { describeSeries } from './describe';
import { Movement, RankingList } from './RankingList';
import './power.css';

const pc = (x: number) => Math.round(x * 100);

function Mover({ label, t, none }: { label: string; t: PowerTeamWeek | null; none: string }) {
  return (
    <div className="pw-mover">
      <div className="micro">{label}</div>
      {t ? (
        <>
          <div className="pw-mover-name"><span className="pw-tname">{t.team}</span><Movement m={t.movement} /></div>
          <div className="note">{t.prevRank !== null ? `${ordinal(t.prevRank)} to ${ordinal(t.rank)}` : ordinal(t.rank)}</div>
        </>
      ) : <div className="note">{none}</div>}
    </div>
  );
}

/** The power rankings tab of around the league: the week's riser and faller, the ranking list, and a bump chart of rank by week. */
export default function PowerRankings({ engine }: { engine: Engine }) {
  const model = engine.model;
  const rankings = useMemo(() => buildPowerRankings(model), [model]);
  const bump = useMemo(() => bumpData(rankings), [rankings]);
  const players = useMemo(() => Object.fromEntries(model.teams.map((t) => [t.rid, topPlayers(model, t.rid, 2)])), [model]);
  const [params, setParams] = useSearchParams();
  const [pinned, setPinned] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const weeks = rankings.weeks;
  if (weeks.length === 0) {
    return (
      <section className="card" aria-labelledby="power-title">
        <SectionHeader id="power-title" title="power rankings" />
        <p className="note">the first power rankings arrive once week 1 is final.</p>
      </section>
    );
  }

  const asked = Number(params.get('week'));
  const current = weeks.find((w) => w.week === asked) ?? weeks[weeks.length - 1]!;
  const latest = current === weeks[weeks.length - 1];
  const setWeek = (w: number) => setParams((prev) => {
    const out = new URLSearchParams(prev);
    if (w === weeks[weeks.length - 1]!.week) out.delete('week'); else out.set('week', String(w));
    return out;
  }, { replace: true });

  const active = hover ?? pinned;
  const me = current.teams.find((t) => t.isMe) ?? null;
  const w = weightsFor(current.hasRos);
  const focus = bump.series.find((s) => s.rid === (active ?? engine.meRid));
  const onPick = (rid: number) => setPinned((p) => (p === rid ? null : rid));

  return (
    <>
      <section className="card pw" aria-labelledby="power-title">
        <SectionHeader
          id="power-title" title={`week ${current.week} power rankings`}
          tip={<>
            how good each team is right now, not just what the record says. the index runs 0 to 100 across the league:
            {' '}all-play win rate {pc(w.allPlay)}, points per game {pc(w.pf)}, the last 3 weeks against the league average {pc(w.form)}
            {current.hasRos ? `, and each roster's expected points for the rest of the season ${pc(w.ros)}` : ''}.
            {' '}rankings for week {current.week} use games through week {current.through}.
            {current.hasRos ? ' only this week knows the rosters: earlier weeks have no old projections, so they use results alone.' : ' earlier weeks use results alone: the model keeps no old projections.'}
          </>}
        />
        <div className="pw-head">
          <Mover label="riser" t={current.riser} none={current.teams[0]?.movement === null ? 'first rankings' : 'no one moved up'} />
          <Mover label="faller" t={current.faller} none={current.teams[0]?.movement === null ? 'first rankings' : 'no one moved down'} />
          {me && (
            <div className="pw-mover">
              <div className="micro">you</div>
              <div className="pw-mover-name"><span className="pw-big">{ordinal(me.rank)}</span><Movement m={me.movement} /></div>
              <div className="note">index {me.index.toFixed(1)}</div>
            </div>
          )}
        </div>
        <div className="pw-weeks">
          <Segmented
            label="Power rankings week" value={current.week} onChange={setWeek}
            options={weeks.map((x) => ({ value: x.week, label: `${x.week}` }))}
          />
          <span className="note pw-basis">
            {current.hasRos ? 'results through week ' + current.through + ' plus rosters' : latest ? `results through week ${current.through}` : `results only, through week ${current.through}`}
          </span>
        </div>
        <RankingList teams={current.teams} players={players} activeRid={active} onHover={setHover} onPick={onPick} />
      </section>

      <section className="card pw" aria-labelledby="power-trend-title">
        <SectionHeader
          id="power-trend-title" title="rank by week"
          tip={<>each line is a team, best at the top. yours is the green one. hover or tap a line, or a team in the list, to bring it forward.</>}
        />
        <BumpChart data={bump} meRid={engine.meRid} activeRid={active} selectedWeek={current.week} onHover={setHover} onPick={onPick} />
        {focus && <p className="note pw-read" aria-live="polite">{describeSeries(focus)}</p>}
      </section>
    </>
  );
}
