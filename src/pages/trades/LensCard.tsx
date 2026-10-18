import { useMemo } from 'react';
import { formatCount, formatOdds, ordinal, formatNum } from '../../app/format';
import { FEATURE } from '../../app/names';
import { SortableTable } from '../../components/SortableTable';
import type { Column } from '../../components/useSort';
import type { Engine } from '../../engine';
import { LENS_BLURB, lensReason, type LensLabel, type LensTeam } from '../../engine/dynasty/index.ts';
import type { DynastyView } from './useDynasty';
import { LensChart } from './LensChart';

const PILL: Record<LensLabel, string> = { contender: 'ok', 'all-in': 'warn', retool: 'warn', rebuilder: 'mute' };

interface Row extends LensTeam {
  team: string;
  isMe: boolean;
  picks: number;
  players: number;
}

interface Props {
  engine: Engine;
  /** null when dynasty mode is off (a redraft league) */
  dyn: DynastyView | null;
  /** a redraft league: show the explore switch */
  redraft: boolean;
  explore: boolean;
  setExplore: (on: boolean) => void;
}

/** Dynasty mode: every team on win-now against future strength, with a label and the numbers behind it. */
export function LensCard({ engine, dyn, redraft, explore, setExplore }: Props) {
  const { meRid } = engine;
  const rows = useMemo<Row[]>(() => {
    if (!dyn?.data || !dyn.lensReady) return [];
    return dyn.data.lens.map((t) => ({
      ...t, team: dyn.team(t.rid).team, isMe: t.rid === meRid, picks: dyn.data!.values[t.rid]?.picks ?? 0, players: dyn.data!.values[t.rid]?.players ?? 0,
    }));
  }, [dyn, meRid]);
  const me = rows.find((r) => r.isMe);

  const columns: Column<Row>[] = [
    {
      key: 'team', header: 'team', value: (r) => r.team, className: 'nowrap',
      render: (r) => <><span className="pname">{r.team}</span>{r.isMe && <span className="you">you</span>}</>,
    },
    { key: 'label', header: 'label', value: (r) => r.label, render: (r) => <span className={`pill ${PILL[r.label]}`} title={LENS_BLURB[r.label]}>{r.label}</span> },
    {
      key: 'odds', header: 'playoff odds', numeric: true, value: (r) => r.playoffPct,
      render: (r) => <>{formatOdds(r.playoffPct)} <span className="dim">{ordinal(r.playoffRank)}</span></>,
    },
    {
      key: 'pts', header: 'exp points', numeric: true, value: (r) => r.ptsRos, className: 'hide-sm',
      render: (r) => <>{formatCount(r.ptsRos)} <span className="dim">{ordinal(r.ptsRank)}</span></>,
    },
    {
      key: 'value', header: 'dynasty value', numeric: true, value: (r) => r.value,
      render: (r) => <span title={`players ${formatCount(r.players)} + picks ${formatCount(r.picks)}`}>{formatCount(r.value)} <span className="dim">{ordinal(r.valueRank)}</span></span>,
    },
    {
      key: 'youth', header: '26 & under', numeric: true, value: (r) => r.youthShare, className: 'hide-sm',
      render: (r) => (r.youthShare === null ? <span className="dim">—</span> : <>{Math.round(r.youthShare * 100)}% <span className="dim">{ordinal(r.youthRank!)}</span></>),
    },
    { key: 'now', header: 'now', numeric: true, value: (r) => r.nowScore, render: (r) => formatNum(r.nowScore, 2), className: 'hide-sm dim' },
    { key: 'future', header: 'later', numeric: true, value: (r) => r.futureScore, render: (r) => formatNum(r.futureScore, 2), className: 'hide-sm dim' },
  ];

  return (
    <section className="card" aria-labelledby="dynasty-title">
      <header>
        <div className="micro">dynasty mode</div>
        <h2 id="dynasty-title">{FEATURE.contender}</h2>
      </header>
      {redraft && (
        <div className="form-row" style={{ justifyContent: 'space-between' }}>
          <p className="note" style={{ margin: 0 }}>
            {explore
              ? 'this is a redraft league. everything here uses fantasycalc dynasty values, which are not redraft values.'
              : 'this league is redraft. dynasty mode scores teams and picks with fantasycalc dynasty values, which are not redraft values.'}
          </p>
          <button type="button" className="btn quiet" aria-pressed={explore} onClick={() => setExplore(!explore)}>
            dynasty mode: explore
          </button>
        </div>
      )}
      {!dyn ? null
        : !dyn.fc || !dyn.data ? <p className="note" role="status">loading fantasycalc values…</p>
        : !dyn.fc.ok ? <p className="note" role="status">dynasty values are unavailable right now, so teams cannot be labelled. {dyn.fc.reason}</p>
        : !dyn.lensReady ? <p className="note" role="status">playoff odds are still simulating; labels appear when they land.</p>
        : (
          <div className="stack">
            {me && (
              <p className="take" aria-live="polite">
                you read as {me.label === 'all-in' ? 'an' : 'a'} {me.label}: {lensReason(me)}
              </p>
            )}
            <LensChart teams={dyn.data.lens} name={(rid) => dyn.team(rid).team} meRid={meRid} />
            <SortableTable
              caption="Contender or rebuilder, every team" columns={columns} rows={rows} rowKey={(r) => r.rid}
              initialSort={{ key: 'value', dir: 'desc' }} rowClassName={(r) => (r.isMe ? 'me' : undefined)}
            />
            <p className="note">
              win-now is half playoff odds, half expected points over the rest of the regular season. future is 60% dynasty value (players plus picks)
              and 40% youth, the share of player value that is 26 or younger. a team is strong on an axis when it ranks in the top half of the league.
            </p>
          </div>
        )}
      {dyn?.playersError && <p className="note" role="status">the players file did not load, so ages are unknown. {dyn.playersError}</p>}
      {dyn && <p className="note">values: fantasycalc.</p>}
    </section>
  );
}
