import { useId, useMemo, useState } from 'react';
import { usePlayersFileIf, usePastViews, useTransactions } from './useScoutData';
import { useModel } from '../../../app/modelContext';
import { AvatarName } from '../../../components/Avatar';
import { Disclosure } from '../../../components/Disclosure';
import { HeadlineStrip } from '../../../components/HeadlineStrip';
import { PlayerLink } from '../../../components/PlayerLink';
import { SectionHeader } from '../../../components/SectionHeader';
import { Segmented } from '../../../components/Segmented';
import { hingesOf, replacementLevels, sideFromLive } from '../../../engine/hinges';
import type { LiveCtx, LiveSnapshot, MatchupLive } from '../../../engine/live';
import {
  buildScoutReport, MY_LABELS, pastWeeksOf, recentMoves, scoutTeam, teamLabels,
} from '../../../engine/scouting';
import type { ScoutLookups, ScoutReport } from '../../../engine/scouting';
import { HingesBody, KeysList, LineupNotes, MovesBody, ThreatsBody, TendenciesBody, HeadToHeadBody } from './sections';
import './scout.css';

export const SCOUT_TAB_LABEL = 'scouting';

interface Props {
  /** the matchup on screen */
  focus: MatchupLive;
  ctx: LiveCtx;
  snapshot: LiveSnapshot;
  /** the week on screen, and this week */
  week: number;
  currentWeek: number;
}

const pts1 = (x: number) => x.toFixed(1);
/** The one word on the closed "season tendencies" row: over or underperformer if they are, else how swingy their scores are. */
function tendencyHint(r: ScoutReport, loading: boolean): string | undefined {
  const vp = r.tendencies.vsProjection;
  if (vp && vp.label !== 'on projection') return vp.label;
  return r.tendencies.scoring?.style ?? (loading ? 'loading' : undefined);
}
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** Opponent scouting for the matchup on screen. In your own matchup it scouts the other side; in any other it scouts the team you pick.
    The week is a review (points, not projections) once its games are over. */
export function Scouting({ focus, ctx, snapshot, week, currentWeek }: Props) {
  const { model } = useModel();
  const id = useId();
  const mineHere = focus.a.isMe || focus.b.isMe;
  const [side, setSide] = useState<'a' | 'b'>('a');
  const targetLive = mineHere ? (focus.a.isMe ? focus.b : focus.a) : focus[side];
  const youLive = targetLive === focus.a ? focus.b : focus.a;
  const review = focus.final || week < currentWeek;
  const isCurrent = week === currentWeek;

  // what only the model knows (injuries, ceilings, IR), for the week in progress only
  const lookups = useMemo<ScoutLookups>(() => {
    if (!model || review || !isCurrent) return {};
    const by = new Map(model.players.map((p) => [p.pid, p]));
    return { injury: (pid) => by.get(pid)?.injury, ceiling: (pid) => by.get(pid)?.hi[week], onIr: (pid) => by.get(pid)?.onIr };
  }, [model, review, isCurrent, week]);
  const target = useMemo(() => scoutTeam(ctx, snapshot, targetLive.rid, lookups), [ctx, snapshot, targetLive.rid, lookups]);
  const you = useMemo(() => scoutTeam(ctx, snapshot, youLive.rid, lookups), [ctx, snapshot, youLive.rid, lookups]);

  const hinges = useMemo(() => {
    if (!model || review || !isCurrent) return null;
    return hingesOf(sideFromLive(targetLive), sideFromLive(youLive), { sd: model.meta.teamWeeklySd, replacement: replacementLevels(model, week) });
  }, [model, review, isCurrent, targetLive, youLive, week]);

  const past = usePastViews(week, true);
  const txs = useTransactions(week, true);
  const pastWeeks = useMemo(() => pastWeeksOf(targetLive.rid, past.views), [past.views, targetLive.rid]);

  // names for the moves: the model first, then (only when a move needs it) the players file
  const base = useMemo(() => (pid: string) => {
    const m = ctx.players[pid];
    return m ? { name: m.name, pos: m.pos, nfl: m.nfl, mu: isCurrent && !review ? ctx.mu[pid] ?? null : null } : null;
  }, [ctx, isCurrent, review]);
  const teamName = useMemo(() => (rid: number) => ctx.teams[rid]?.name ?? `team ${rid}`, [ctx]);
  const unknown = useMemo(() => recentMoves({ rid: targetLive.rid, week, transactions: txs.transactions, lookup: { player: base, teamName } })
    .some((m) => [...m.adds, ...m.drops].some((p) => p.name.startsWith('player '))), [targetLive.rid, week, txs.transactions, base, teamName]);
  const fromFile = usePlayersFileIf(unknown);
  const moveLookup = useMemo(() => ({ player: (pid: string) => base(pid) ?? fromFile(pid), teamName }), [base, fromFile, teamName]);

  const report = useMemo<ScoutReport | null>(() => {
    if (!target || !you || !model) return null;
    return buildScoutReport({
      week, review, target, you, labels: mineHere ? MY_LABELS : teamLabels(you.name, target.name), hinges,
      past: pastWeeks, history: model.history, transactions: txs.transactions, moves: moveLookup,
    });
  }, [target, you, model, week, review, mineHere, hinges, pastWeeks, txs.transactions, moveLookup]);

  if (!report || !target || !you) return <p className="note" role="status">no lineup to scout for this matchup.</p>;
  const labels = mineHere ? MY_LABELS : teamLabels(you.name, target.name);
  const h = report.headline;
  const t = h.threat;
  const threats = report.lineup.threats;
  const top = report.hinges?.rows.find((r) => r.state !== 'final' && r.atStake > 0);

  return (
    <div className="scout">
      <div className="scout-who">
        <p className="scout-name">
          <span className="gd-h3">{review ? `week ${week} in review` : 'scouting'}</span>
          <b>{target.name}</b>{target.manager && <span className="dim"> · {target.manager.toLowerCase()}</span>}
        </p>
        {!mineHere && (
          <Segmented
            label="team to scout" value={side} onChange={setSide}
            options={[{ value: 'a', label: focus.a.name }, { value: 'b', label: focus.b.name }]}
          />
        )}
      </div>

      <HeadlineStrip
        label={`scouting ${target.name}`}
        items={[
          { label: review ? 'their score' : 'their projection', value: pts1(h.projection), sub: `vs ${labels.youPoss} ${pts1(h.otherProjection)}` },
          {
            label: 'their lineup',
            value: h.lineup.isOptimal ? 'optimal' : `−${pts1(h.lineup.left)}`,
            sub: h.lineup.isOptimal ? 'best lineup set' : `point${h.lineup.left === 1 ? '' : 's'} left on the bench`,
          },
          {
            label: review ? 'top scorer' : 'biggest threat',
            value: t ? <AvatarName pid={t.player.pid} name={t.player.name} pos={t.player.pos} team={t.player.nfl ?? undefined} size={28}><PlayerLink pid={t.player.pid} name={t.player.name} /></AvatarName> : '—',
            sub: t?.detail,
          },
        ]}
      />

      {!review && report.keys.length > 0 && (
        <section className="card" aria-labelledby={`${id}-keys`}>
          <SectionHeader
            id={`${id}-keys`} title="how to beat them"
            tip="two or three keys, each a rule over this week’s numbers: the slot with the biggest projection gap, an empty or injured starter, who plays last, the starter their week rides on, a loose lineup, and their habits over the season. the heaviest three show."
          />
          <KeysList keys={report.keys} />
        </section>
      )}

      <section className="card" aria-labelledby={`${id}-lineup`}>
        <SectionHeader
          id={`${id}-lineup`} title="their lineup"
          tip={review
            ? 'the lineup they started against the best lineup their roster allowed, by actual points. a flag is a starter who scored less than a bench player he could have swapped for.'
            : 'the lineup they set against the best lineup their roster allows, by projection. while games are on, a player whose game has started cannot be moved. flags: a better player on the bench, an empty slot, a starter who is questionable, doubtful or out, a starter on a bye.'}
        />
        <p className="note scout-grade">
          {review ? 'scored' : 'projected'} <b>{pts1(report.lineup.projection)}</b>
          {report.lineup.isOptimal ? ' · the best lineup was set' : <> · best lineup <b>{pts1(report.lineup.optimal)}</b></>}
        </p>
        <LineupNotes notes={report.lineup.notes} review={review} optimal={report.lineup.isOptimal} />
      </section>

      <div className="scout-more">
        <Disclosure title={review ? 'bench players who outscored a starter' : 'bench threat'} level={3} hint={threats.length ? `${threats.length} ${plural(threats.length, 'player')}` : review ? 'none' : 'none close'}>
          <ThreatsBody threats={threats} review={review} />
        </Disclosure>
        {!review && report.hinges && (
          <Disclosure title="their hinges" level={3} hint={top ? top.name.toLowerCase() : undefined}>
            <HingesBody result={report.hinges} />
          </Disclosure>
        )}
        <Disclosure title="season tendencies" level={3} hint={tendencyHint(report, past.loading)}>
          <TendenciesBody t={report.tendencies} loading={past.loading} />
        </Disclosure>
        <Disclosure title="recent moves" level={3} hint={report.moves.length ? `${report.moves.length} in 2 weeks` : txs.loading ? 'loading' : 'none'}>
          <MovesBody moves={report.moves} loading={txs.loading} />
        </Disclosure>
        <Disclosure title="head to head this season" level={3} hint={report.headToHead.summary}>
          <HeadToHeadBody h={report.headToHead} labels={labels} />
        </Disclosure>
      </div>
    </div>
  );
}
