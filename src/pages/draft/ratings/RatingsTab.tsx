import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCount, formatPoints1, ordinal, signed } from '../../../app/format';
import { useModel } from '../../../app/modelContext';
import { HeadlineStrip } from '../../../components/HeadlineStrip';
import { SectionHeader } from '../../../components/SectionHeader';
import { SortableTable } from '../../../components/SortableTable';
import type { Column } from '../../../components/useSort';
import { isDynasty } from '../../../engine';
import type { Engine } from '../../../engine';
import { POWER_WEIGHTS, rateTeams } from '../../../engine/draft/ratings.ts';
import type { DynastyFacts, TeamRating } from '../../../engine/draft/ratings.ts';
import { buildStandings } from '../../standings';
import type { DraftRoom } from '../model';
import { TierChips } from './TierChip';
import { groupLabel } from './labels';
import { TeamRatingDrawer } from './TeamRatingDrawer';
import { useDynasty } from '../../trades/useDynasty';
import './ratings.css';

/** Every team's rating from the rosters as they stand today: rest-of-season strength, a power index, the position groups. */
export function RatingsTab({ room }: { room: DraftRoom }) {
  const { engine, loading, error } = useModel();
  if (!engine) {
    return (
      <section className="card" aria-labelledby="ratings-wait">
        <SectionHeader id="ratings-wait" title="team ratings" />
        <p className={`note${error && !loading ? ' neg-c' : ''}`} role="status">
          {error && !loading ? `could not build the season model. ${error}` : 'pulling rosters and projections…'}
        </p>
      </section>
    );
  }
  return <Body room={room} engine={engine} />;
}

const rec = (r: Pick<TeamRating, 'wins' | 'losses' | 'ties'>) => `${r.wins}–${r.losses}${r.ties ? `–${r.ties}` : ''}`;

function Body({ room, engine }: { room: DraftRoom; engine: Engine }) {
  const [open, setOpen] = useState<number | null>(null);
  const { model } = engine;
  const dynastyLeague = isDynasty(room.league);
  const dyn = useDynasty(engine, room.league, dynastyLeague);

  const facts = useMemo<Record<number, DynastyFacts> | null>(() => {
    if (!dynastyLeague || !dyn?.data || !dyn.fc?.ok) return null;
    const out: Record<number, DynastyFacts> = {};
    for (const [rid, v] of Object.entries(dyn.data.values)) out[Number(rid)] = { value: v.total, youthShare: v.youthShare };
    return out;
  }, [dynastyLeague, dyn]);

  const recordRank = useMemo(() => {
    const out: Record<number, number> = {};
    for (const r of buildStandings(room.bundle, room.userId)) out[r.rosterId] = r.rank;
    return out;
  }, [room.bundle, room.userId]);

  const ratings = useMemo(() => rateTeams({ model, dynasty: facts, recordRank }), [model, facts, recordRank]);
  const me = ratings.teams.find((t) => t.rid === model.meRid) ?? null;
  const n = ratings.teams.length;

  const columns = useMemo<Column<TeamRating>[]>(() => [
    { key: 'rank', header: '#', numeric: true, value: (r) => r.powerRank, className: 'dim' },
    { key: 'team', header: 'team', essential: true, value: (r) => r.team, className: 'nowrap', render: (r) => <><span className="pname">{r.team}</span>{r.isMe && <span className="you">you</span>}</> },
    {
      key: 'power', header: 'power', essential: true, numeric: true, value: (r) => r.power,
      render: (r) => (
        <span className="pw" title={`power rating ${formatPoints1(r.power)} of 100`}>
          <span className="pw-n">{formatPoints1(r.power)}</span>
          <span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, r.power))}%` }} /></span>
        </span>
      ),
    },
    { key: 'ros', header: 'ros strength', numeric: true, value: (r) => r.rosPts, render: (r) => <>{formatCount(r.rosPts)} <span className="dim">{ordinal(r.rosRank)}</span></> },
    { key: 'record', header: 'record', numeric: true, value: (r) => r.wins + r.ties / 2 - r.losses / 1000, render: (r) => rec(r) },
    {
      key: 'delta', header: 'roster vs record', essential: true, numeric: true, value: (r) => r.delta,
      render: (r) => (
        <span title={`roster says ${ordinal(r.powerRank)}, record says ${ordinal(r.recordRank)}`}>
          <span className={r.delta > 0 ? 'pos-c' : r.delta < 0 ? 'neg-c' : 'dim'}>{r.delta === 0 ? '±0' : signed(r.delta, 0)}</span>
          <span className="dim rv"> roster {ordinal(r.powerRank)} · record {ordinal(r.recordRank)}</span>
        </span>
      ),
    },
    { key: 'groups', header: 'position groups', sortable: false, render: (r) => <TierChips groups={r.groups} /> },
    { key: 'playoff', header: 'playoff weeks', more: true, numeric: true, value: (r) => r.playoffPts, render: (r) => <>{formatCount(r.playoffPts)} <span className="dim">{ordinal(r.playoffRank)}</span></> },
    { key: 'depth', header: 'depth', more: true, numeric: true, value: (r) => r.groups.reduce((s, g) => s + g.depth, 0), render: (r) => formatCount(r.groups.reduce((s, g) => s + g.depth, 0)), className: 'dim' },
    { key: 'pf', header: 'points for', more: true, numeric: true, value: (r) => r.pf, render: (r) => <>{formatCount(r.pf)} <span className="dim">{ordinal(r.pfRank)}</span></> },
    { key: 'need', header: 'biggest need', more: true, value: (r) => r.need ?? '', render: (r) => (r.need ? groupLabel(r.need) : '—') },
    { key: 'surplus', header: 'biggest surplus', more: true, value: (r) => r.surplus ?? '', render: (r) => (r.surplus ? groupLabel(r.surplus) : '—') },
    ...(ratings.dynasty ? [
      {
        key: 'value', header: 'dynasty value', more: true, numeric: true, value: (r: TeamRating) => r.dynasty?.value ?? null,
        render: (r: TeamRating) => (r.dynasty ? <>{formatCount(r.dynasty.value)} <span className="dim">{ordinal(r.dynasty.valueRank)}</span></> : '—'),
      } satisfies Column<TeamRating>,
      {
        key: 'youth', header: '26 & under', more: true, numeric: true, value: (r: TeamRating) => r.dynasty?.youthShare ?? null,
        render: (r: TeamRating) => (r.dynasty?.youthShare == null ? <span className="dim">—</span> : <>{Math.round(r.dynasty.youthShare * 100)}%{r.dynasty.youthRank ? <span className="dim"> {ordinal(r.dynasty.youthRank)}</span> : null}</>),
      } satisfies Column<TeamRating>,
    ] : []),
  ], [ratings.dynasty]);

  const needG = me?.need ? me.groups.find((g) => g.key === me.need) : null;
  const surG = me?.surplus ? me.groups.find((g) => g.key === me.surplus) : null;
  const openTeam = open === null ? null : ratings.teams.find((t) => t.rid === open) ?? null;

  return (
    <div className="stack">
      {me && (
        <HeadlineStrip
          label="your team rating"
          items={[
            { label: 'your power rating', value: formatPoints1(me.power), sub: `${ordinal(me.powerRank)} of ${n} · record says ${ordinal(me.recordRank)}` },
            {
              label: 'biggest need', value: me.need ? groupLabel(me.need) : '—',
              sub: me.need ? <>{needG?.tier} · {ordinal(needG?.rank ?? 0)} in the league · <Link to="/trades">trade block →</Link></> : undefined,
            },
            { label: 'biggest surplus', value: me.surplus ? groupLabel(me.surplus) : '—', sub: me.surplus ? `${surG?.tier ?? ''} · depth to trade` : 'no spare depth' },
          ]}
        />
      )}

      <section className="card" aria-labelledby="ratings-title">
        <SectionHeader
          id="ratings-title" title="power ratings"
          tip={<>
            built from today’s rosters. <strong>ros strength</strong> is the model’s expected points of each team’s best lineup over the rest of the regular season; playoff weeks are the same sum over the playoff weeks.
            the <strong>power rating</strong> (0 to 100) is {Math.round(POWER_WEIGHTS.ros * 100)}% ros strength plus {Math.round(POWER_WEIGHTS.pf * 100)}% points scored so far, each scaled from the league’s worst (0) to its best (100).
            <strong> roster vs record</strong> is the standings rank minus the power rank: +3 means the roster is three places better than the record. position groups are ranked across the league
            (top quarter elite, then strong, average, thin); a group counts its starters’ ros points plus a quarter of the next man up on the bench. {ratings.dynasty ? 'dynasty columns use fantasycalc values.' : ''}
          </>}
        />
        {dynastyLeague && dyn?.fc && !dyn.fc.ok && <p className="note" role="status">dynasty values are unavailable right now, so the dynasty columns are hidden.</p>}
        <SortableTable
          caption="Team power ratings" columns={columns} rows={ratings.teams} rowKey={(r) => r.rid} tableId="team-ratings"
          initialSort={{ key: 'power', dir: 'desc' }} rowClassName={(r) => (r.isMe ? 'me' : undefined)} onRowActivate={(r) => setOpen(r.rid)}
        />
      </section>

      <TeamRatingDrawer rating={openTeam} ratings={ratings} onClose={() => setOpen(null)} />
    </div>
  );
}
