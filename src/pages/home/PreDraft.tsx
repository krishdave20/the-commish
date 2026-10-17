import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDraftInputs, useRankings } from '../../app/draftInputs';
import { formatAsOf } from '../../app/format';
import { FEATURE, PAGES } from '../../app/names';
import { currentDraft } from '../../app/phase';
import { usePrepChecks } from '../../app/prepChecks';
import { formatCountdown, useNow } from '../../app/useNow';
import { Checklist } from '../../components/Checklist';
import { PlayerLink } from '../../components/PlayerLink';
import { createMock, draftOrderFor, slotOfUser } from '../../engine';
import type { Rankings } from '../../engine';
import type { LeagueBundle, SleeperDraft } from '../../data';

const TIER_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const NAMES_PER_TIER = 8;

export function Countdown({ draft }: { draft: SleeperDraft | null }) {
  const now = useNow();
  const start = draft?.start_time ?? null;
  return (
    <section className="card" aria-labelledby="countdown-title">
      <header>
        <div className="micro">{start ? formatAsOf(start) : 'from the draft’s start time in sleeper'}</div>
        <h2 id="countdown-title">{FEATURE.countdown}</h2>
      </header>
      {start === null ? <p className="note">no draft time is set yet. the commissioner sets it in sleeper.</p>
        : start > now ? (
          <>
            <div className="countdown" role="timer" aria-label="Time until the draft">{formatCountdown(start - now)}</div>
            <p className="note">updates every minute.</p>
          </>
        )
        : <p className="take">the scheduled draft time has passed ({formatAsOf(start)}).</p>}
    </section>
  );
}

function mockFor(rankings: Rankings, draft: SleeperDraft, tradedPicks: LeagueBundle['tradedPicks'], bundle: LeagueBundle, userId: string | null) {
  try {
    const order = draftOrderFor(draft, tradedPicks, bundle.league.total_rosters);
    const slot = userId ? slotOfUser(draft, userId) : null;
    const mineRoster = bundle.rosters.find((r) => !!userId && (r.owner_id === userId || !!r.co_owners?.includes(userId)));
    const bySlot = slot ? order.find((o) => o.slot === slot)?.originalRosterId : undefined;
    const rid = bySlot ?? mineRoster?.roster_id;
    if (rid === undefined) return { error: 'could not tell which team is yours.' } as const;
    const mock = createMock({ rankings, order, userRosterId: rid });
    mock.autoAll();
    const state = mock.state;
    const picks = state.picks.filter((p) => p.rosterId === rid).map((p) => ({ ...p, player: rankings.byPid[p.pid]! }));
    return { grade: state.grade ?? mock.grade(rid), picks, assumed: slot === null ? rid : null } as const;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) } as const;
  }
}

/** Countdown, your draft slot, a prep checklist, the tiers to study, and a quick mock draft at your real slot. */
export function PreDraft({ bundle, userId }: { bundle: LeagueBundle; userId: string | null }) {
  const { league } = bundle;
  const listed = currentDraft(league, bundle.drafts);
  const inputs = useDraftInputs(league, { draftId: listed?.draft_id ?? null, enabled: true });
  const rankings = useRankings(league, inputs.data);
  const draft = inputs.data?.draft ?? listed;
  const prep = usePrepChecks(league.league_id);

  const slot = draft && userId ? slotOfUser(draft, userId) : null;
  const teams = draft?.settings.teams ?? league.total_rosters;
  const mock = useMemo(
    () => (rankings && draft ? mockFor(rankings, draft, inputs.data?.tradedPicks ?? [], bundle, userId) : null),
    [rankings, draft, inputs.data?.tradedPicks, bundle, userId],
  );

  const tierPos = rankings?.rows[0]?.pos.toLowerCase() ?? 'rb';
  const items = [
    { id: 'tiers', label: `study the tiers: ${tierPos} tier 1–2`, done: prep.done.has('tiers') },
    { id: 'mock', label: 'run a mock draft', done: prep.done.has('mock') },
    { id: 'queue', label: 'set your queue', done: prep.done.has('queue') },
  ];

  const tiers = useMemo(() => {
    if (!rankings) return [];
    const out: Array<{ pos: string; tier: number; names: Array<{ pid: string; name: string }> }> = [];
    for (const pos of TIER_POSITIONS) {
      for (const tier of [1, 2]) {
        const rows = rankings.rows.filter((r) => r.pos === pos && r.tier === tier).sort((a, b) => a.posRank - b.posRank);
        if (rows.length) out.push({ pos, tier, names: rows.slice(0, NAMES_PER_TIER).map((r) => ({ pid: r.pid, name: r.name })) });
      }
    }
    return out;
  }, [rankings]);

  return (
    <>
      <div className="grid2">
        <Countdown draft={draft} />
        <section className="card" aria-labelledby="slot-title">
          <header>
            <div className="micro">{draft ? `${draft.type} draft` : 'draft'}</div>
            <h2 id="slot-title">your draft slot</h2>
          </header>
          {slot !== null ? (
            <>
              <div className="stat"><span className="v">{slot} <span className="dim">of {teams}</span></span></div>
              <p className="note">you pick #{slot} overall in round one.</p>
            </>
          ) : <p className="note">the draft order is not set yet. it appears here once the commissioner sets it in sleeper.</p>}
        </section>
      </div>

      <div className="grid2">
        <section className="card" aria-labelledby="prep-title">
          <header>
            <div className="micro">saved on this device for this league</div>
            <h2 id="prep-title">{FEATURE.prep}</h2>
          </header>
          <Checklist label={FEATURE.prep} items={items} onToggle={prep.toggle} />
          <p className="note">rankings, tiers and the full {FEATURE.mock} live in the <Link to={PAGES.draft.path}>{PAGES.draft.name}</Link>.</p>
        </section>

        <section className="card" aria-labelledby="mock-title">
          <header>
            <div className="micro">a quick auto-draft at your real slot</div>
            <h2 id="mock-title">{FEATURE.mock}</h2>
          </header>
          {!rankings ? <p className="note" role="status">{inputs.error ? `could not load the rankings. ${inputs.error}` : 'loading the rankings…'}</p>
            : !mock ? null
            : 'error' in mock ? <p className="note" role="status">the quick mock could not run. {mock.error}</p>
            : (
              <>
                <div className="row">
                  <div className="stat"><span className="micro">projected grade</span><span className="v">{mock.grade.letter}</span></div>
                  <div className="stat"><span className="micro">lineup rank</span><span className="v">{mock.grade.rank} <span className="dim">of {mock.grade.teams}</span></span></div>
                  <div className="stat"><span className="micro">vs the median team</span><span className={`v ${mock.grade.vsMedian >= 0 ? 'pos-c' : 'neg-c'}`}>{mock.grade.vsMedian >= 0 ? '+' : '−'}{Math.abs(mock.grade.vsMedian).toFixed(0)}</span></div>
                </div>
                <p className="note">
                  {mock.assumed !== null ? `your slot is not set, so this assumes the pick order of roster ${mock.assumed}. ` : ''}
                  your first picks: {mock.picks.slice(0, 4).map((p) => `${p.player.name} (round ${p.round}, #${p.pickNo})`).join(', ')}.
                </p>
              </>
            )}
          <p className="note">full mock draft arrives in the draft room (milestone 5).</p>
        </section>
      </div>

      <section className="card" aria-labelledby="tiers-title">
        <header>
          <div className="micro">value over replacement, grouped by natural gaps</div>
          <h2 id="tiers-title">tiers to study</h2>
        </header>
        {!rankings ? <p className="note" role="status">loading the rankings…</p>
          : tiers.length === 0 ? <p className="note">no tiers yet: the season projections are not out.</p>
          : (
            <dl className="tiers">
              {tiers.map((t) => (
                <div key={`${t.pos}${t.tier}`}>
                  <dt>{t.pos} tier {t.tier}</dt>
                  <dd>{t.names.map((n, i) => <span key={n.pid}>{i > 0 && ', '}<PlayerLink pid={n.pid} name={n.name} /></span>)}</dd>
                </div>
              ))}
            </dl>
          )}
      </section>
    </>
  );
}
