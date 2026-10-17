/* Endpoint health checks for Settings → Data health. Hits every endpoint in SPEC section 4 once and
   says, in plain English, what works and what breaks. Undocumented Sleeper endpoints that fail name the
   features that depend on them. Network goes through the shared limiter. */
import type { HealthContext, HealthResult } from './contract.ts';
import type { Limiter } from './limiter.ts';
import { shapes, type Guard } from './shapes.ts';
import type { SleeperClient } from './sleeper.ts';
import type { Transport } from './transport.ts';
import { fantasyCalcUrl, nflverseUrls, sleeperUrls } from './urls.ts';

export interface HealthDeps {
  transport: Transport;
  limiter: Limiter;
  client: SleeperClient;
  now: () => number;
}

const CORS_WARN = 'Blocked by the browser (no CORS on GitHub releases). Will come from the nightly data job in milestone 3.';

interface Spec {
  id: string;
  label: string;
  url: string;
  documented: boolean;
  source: HealthResult['source'];
  method?: 'GET' | 'HEAD';
  guard?: Guard<unknown>;
  /** what the rows are, for the ok message */
  noun?: string;
  /** what stops working if this endpoint breaks */
  impact: string;
  /** an empty but well-formed answer is a warning with this text */
  emptyWarn?: string;
  /** body may legitimately be null */
  nullOk?: boolean;
  /** HTTP 404 is an expected gap, not a failure */
  missingWarn?: string;
  onBody?: (body: unknown) => void;
}

const size = (b: unknown) => (Array.isArray(b) ? b.length : b && typeof b === 'object' ? Object.keys(b).length : 0);
const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function createHealth(deps: HealthDeps) {
  const { transport, limiter, client, now } = deps;

  const result = (s: Pick<Spec, 'id' | 'label' | 'url' | 'documented' | 'source'>, r: Partial<HealthResult> & Pick<HealthResult, 'level' | 'message'>): HealthResult => ({
    id: s.id, label: s.label, url: s.url, documented: s.documented, source: s.source,
    httpStatus: null, ms: 0, bytes: 0, checkedAt: now(), ...r,
  });

  async function probe(s: Spec): Promise<HealthResult> {
    const t0 = now();
    let res;
    try {
      res = await limiter.run(() => transport(s.url, { method: s.method ?? 'GET' }));
    } catch (e) {
      const ms = now() - t0;
      // fetch() rejects with a TypeError both when offline and when CORS blocks the response
      if (s.source === 'nflverse' && e instanceof TypeError) return result(s, { level: 'warn', message: CORS_WARN, ms });
      return result(s, { level: 'fail', message: `Could not reach ${s.label}: ${e instanceof Error ? e.message : String(e)}. ${s.impact}`, ms });
    }
    const base = { httpStatus: res.status, ms: res.ms, bytes: res.bytes };
    if (s.method === 'HEAD') {
      if (res.status >= 200 && res.status < 400) return result(s, { ...base, level: 'ok', message: `Reachable${res.bytes ? `, ${kb(res.bytes)}` : ''}.` });
      if (res.status === 404 && s.missingWarn) return result(s, { ...base, level: 'warn', message: s.missingWarn });
      return result(s, { ...base, level: 'fail', message: `${s.label} answered HTTP ${res.status}. ${s.impact}` });
    }
    if (res.status !== 200) {
      if (res.status === 404 && s.missingWarn) return result(s, { ...base, level: 'warn', message: s.missingWarn });
      return result(s, { ...base, level: 'fail', message: `${s.label} answered HTTP ${res.status}. ${s.impact}` });
    }
    if (res.body === null || res.body === undefined) {
      return s.nullOk
        ? result(s, { ...base, level: 'ok', message: 'Answered (no data for that id).' })
        : result(s, { ...base, level: 'fail', message: `${s.label} answered with nothing. ${s.impact}` });
    }
    if (s.guard && !s.guard(res.body)) {
      return result(s, { ...base, level: 'fail', message: `${s.label} came back in a different shape than expected. ${s.impact}` });
    }
    s.onBody?.(res.body);
    const n = size(res.body);
    if (n === 0 && s.emptyWarn) return result(s, { ...base, level: 'warn', message: s.emptyWarn });
    // a single object (state, user, league) has no meaningful count; say it answered as expected
    if (!Array.isArray(res.body) && s.noun === 'account') return result(s, { ...base, level: 'ok', message: 'Account found.' });
    if (!Array.isArray(res.body) && s.noun === 'fields') return result(s, { ...base, level: 'ok', message: 'Answered in the expected shape.' });
    return result(s, { ...base, level: 'ok', message: `${n} ${s.noun ?? 'items'}.` });
  }

  const skipped = (s: Pick<Spec, 'id' | 'label' | 'documented' | 'source'>, why: string): HealthResult =>
    result({ ...s, url: '' }, { level: 'warn', message: `Skipped: ${why}.` });

  async function checkPlayers(): Promise<HealthResult> {
    const s = { id: 'sleeper.players', label: 'Sleeper players', url: sleeperUrls.players(), documented: true, source: 'sleeper' as const };
    const t0 = now();
    try {
      const r = await client.players();
      const n = size(r.data);
      const where = r.fromCache ? `from the cache (fetched ${new Date(r.asOf).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : 'fetched just now';
      if (r.stale) return result(s, { level: 'warn', message: `${n} players, ${where}. Network failed (${r.error}); using the old copy.`, bytes: r.bytes });
      return result(s, { level: 'ok', httpStatus: r.status, ms: r.ms || now() - t0, bytes: r.bytes, message: `${n} players, ${where}.` });
    } catch (e) {
      return result(s, { level: 'fail', ms: now() - t0, message: `${e instanceof Error ? e.message : String(e)}. Player names, injuries and ID joins depend on this.` });
    }
  }

  async function healthChecks(ctx: HealthContext): Promise<HealthResult[]> {
    const season = ctx.season;
    const week = Math.max(1, ctx.week);
    const prevWeek = Math.max(1, week - 1);
    const prevSeason = String(Number(season) - 1);
    const L = ctx.leagueId;
    let draftId = ctx.draftId;
    const sl = { documented: true, source: 'sleeper' as const };
    const un = { documented: false, source: 'sleeper' as const };
    const fc = { documented: true, source: 'fantasycalc' as const };
    const nv = { documented: true, source: 'nflverse' as const, method: 'HEAD' as const };
    const needLeague = (id: string, label: string) => skipped({ id, label, ...sl }, 'no league selected');

    const order: string[] = [];
    const jobs = new Map<string, () => Promise<HealthResult>>();
    const add = (id: string, fn: () => Promise<HealthResult>) => { order.push(id); jobs.set(id, fn); };
    const addSpec = (s: Spec | null, fallback?: () => HealthResult) => {
      if (s) add(s.id, () => probe(s));
      else if (fallback) { const r = fallback(); add(r.id, async () => r); }
    };

    addSpec({ id: 'sleeper.state', label: 'NFL state', url: sleeperUrls.state(), ...sl, guard: shapes.nflState, noun: 'fields', impact: 'The current week and season phase depend on this.' });
    addSpec(ctx.username
      ? { id: 'sleeper.user', label: 'Sleeper user', url: sleeperUrls.user(ctx.username), ...sl, guard: shapes.user, noun: 'account', impact: 'Sign-in depends on this.' }
      : null, () => skipped({ id: 'sleeper.user', label: 'Sleeper user', ...sl }, 'no username'));
    addSpec(ctx.userId
      ? { id: 'sleeper.userLeagues', label: 'User leagues', url: sleeperUrls.userLeagues(ctx.userId, season), ...sl, guard: shapes.leagues, noun: 'leagues', impact: 'The league picker depends on this.' }
      : null, () => skipped({ id: 'sleeper.userLeagues', label: 'User leagues', ...sl }, 'no user id'));
    if (L) {
      addSpec({ id: 'sleeper.league', label: 'League', url: sleeperUrls.league(L), ...sl, guard: shapes.league, noun: 'fields', impact: 'League settings and scoring depend on this.' });
      addSpec({ id: 'sleeper.rosters', label: 'Rosters', url: sleeperUrls.rosters(L), ...sl, guard: shapes.rosters, noun: 'rosters', impact: 'Every team page depends on this.' });
      addSpec({ id: 'sleeper.users', label: 'League users', url: sleeperUrls.users(L), ...sl, guard: shapes.leagueUsers, noun: 'managers', impact: 'Manager names and team names depend on this.' });
      addSpec({ id: 'sleeper.matchups', label: `Matchups, week ${week}`, url: sleeperUrls.matchups(L, week), ...sl, guard: shapes.matchups, noun: 'entries', impact: 'Standings, lineups and the season simulation depend on this.', emptyWarn: 'No matchups for this week yet.' });
      addSpec({ id: 'sleeper.transactions', label: `Transactions, week ${prevWeek}`, url: sleeperUrls.transactions(L, prevWeek), ...sl, guard: shapes.transactions, noun: 'transactions', impact: 'Trade and waiver history depend on this.' });
      addSpec({ id: 'sleeper.tradedPicks', label: 'Traded picks', url: sleeperUrls.tradedPicks(L), ...sl, guard: shapes.tradedPicks, noun: 'picks', impact: 'Dynasty pick ownership depends on this.' });
      addSpec({
        id: 'sleeper.drafts', label: 'League drafts', url: sleeperUrls.drafts(L), ...sl, guard: shapes.drafts, noun: 'drafts',
        impact: 'Draft countdown and the live assistant depend on this.',
        onBody: (b) => { if (!draftId && Array.isArray(b) && b[0] && typeof b[0].draft_id === 'string') draftId = b[0].draft_id; },
      });
    } else {
      for (const [id, label] of [['sleeper.league', 'League'], ['sleeper.rosters', 'Rosters'], ['sleeper.users', 'League users'], ['sleeper.matchups', 'Matchups'],
        ['sleeper.transactions', 'Transactions'], ['sleeper.tradedPicks', 'Traded picks'], ['sleeper.drafts', 'League drafts']] as const) addSpec(null, () => needLeague(id, label));
    }
    add('sleeper.players', checkPlayers);
    addSpec({ id: 'sleeper.trendingAdd', label: 'Trending adds', url: sleeperUrls.trending('add', 24, 50), ...sl, guard: shapes.trending, noun: 'players', impact: 'Waiver risers depend on this.' });
    addSpec({ id: 'sleeper.trendingDrop', label: 'Trending drops', url: sleeperUrls.trending('drop', 24, 50), ...sl, guard: shapes.trending, noun: 'players', impact: 'Waiver risers depend on this.' });

    /* undocumented */
    addSpec({ id: 'sleeper.stats', label: `Weekly stats, week ${prevWeek}`, url: sleeperUrls.stats(season, prevWeek), ...un, guard: shapes.weekStats, noun: 'player lines', impact: 'Usage splits and floors/ceilings depend on this.', emptyWarn: 'No stats published for that week yet.' });
    addSpec({ id: 'sleeper.projections', label: `Weekly projections, week ${week}`, url: sleeperUrls.projections(season, week), ...un, guard: shapes.projections, noun: 'projections', impact: 'Player means (every projected point total) depend on this.', emptyWarn: 'No projections published for this week yet.' });
    addSpec({ id: 'sleeper.seasonProjections', label: 'Season projections and ADP', url: sleeperUrls.seasonProjections(season), ...un, guard: shapes.projections, noun: 'projections', impact: 'Draft rankings and ADP depend on this.', emptyWarn: 'No season projections published yet.' });
    addSpec({ id: 'sleeper.schedule', label: 'NFL schedule', url: sleeperUrls.schedule(season), ...un, guard: shapes.schedule, noun: 'games', impact: 'Matchup grades and opponents depend on this.', emptyWarn: 'No schedule published yet.' });

    /* FantasyCalc */
    addSpec({ id: 'fantasycalc.dynasty', label: 'FantasyCalc dynasty values', url: fantasyCalcUrl({ isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 }), ...fc, guard: shapes.fantasyCalc, noun: 'players', impact: 'Dynasty trade values and rookie ranks depend on this; everything else keeps working.' });
    addSpec({ id: 'fantasycalc.redraft', label: 'FantasyCalc redraft values', url: fantasyCalcUrl({ isDynasty: false, numQbs: 1, numTeams: 12, ppr: 1 }), ...fc, guard: shapes.fantasyCalc, noun: 'players', impact: 'Redraft trade values depend on this; everything else keeps working.' });

    /* nflverse (HEAD only; a browser TypeError here means CORS) */
    addSpec({ id: 'nflverse.pbp', label: `Play-by-play ${season}`, url: nflverseUrls.pbp(season), ...nv, impact: 'Target and air-yards stats depend on this.' });
    addSpec({ id: 'nflverse.snapCounts', label: `Snap counts ${season}`, url: nflverseUrls.snapCounts(season), ...nv, impact: 'Snap share depends on this.' });
    addSpec({ id: 'nflverse.ftn', label: `FTN charting ${season}`, url: nflverseUrls.ftn(season), ...nv, impact: 'FTN splits depend on this.' });
    addSpec({ id: 'nflverse.participationPrev', label: `Participation ${prevSeason}`, url: nflverseUrls.participation(prevSeason), ...nv, impact: 'Route and coverage splits depend on this.' });
    addSpec({ id: 'nflverse.participation', label: `Participation ${season}`, url: nflverseUrls.participation(season), ...nv, impact: 'Route and coverage splits depend on this.', missingWarn: `Not published yet; ${prevSeason} used, labeled last season.` });
    addSpec({ id: 'nflverse.players', label: 'nflverse player IDs', url: nflverseUrls.players(), ...nv, impact: 'ID joins to nflverse data depend on this.' });

    // draft-specific endpoints need a draft id, which may come from the drafts response above
    const draftIds = ['sleeper.draft', 'sleeper.draftPicks', 'sleeper.draftTradedPicks'];
    const first = order.slice();
    const out = new Map<string, HealthResult>();
    await Promise.all(first.map(async (id) => { out.set(id, await jobs.get(id)!()); }));

    const dSpecs: Array<[string, string, (d: string) => string, Guard<unknown>, string, string]> = [
      ['sleeper.draft', 'Draft', sleeperUrls.draft, shapes.draft, 'fields', 'The draft board depends on this.'],
      ['sleeper.draftPicks', 'Draft picks', sleeperUrls.draftPicks, shapes.draftPicks, 'picks', 'The live draft assistant depends on this.'],
      ['sleeper.draftTradedPicks', 'Draft traded picks', sleeperUrls.draftTradedPicks, shapes.tradedPicks, 'picks', 'Pick ownership in the draft depends on this.'],
    ];
    await Promise.all(dSpecs.map(async ([id, label, url, guard, noun, impact]) => {
      if (!draftId) {
        out.set(id, skipped({ id, label, ...sl }, L ? 'this league has no draft' : 'no draft selected'));
        return;
      }
      out.set(id, await probe({ id, label, url: url(draftId), ...sl, guard, noun, impact }));
    }));

    // keep a stable, readable order: draft rows sit after league drafts
    const fullOrder = order.flatMap((id) => (id === 'sleeper.drafts' ? [id, ...draftIds] : [id]));
    return fullOrder.map((id) => out.get(id)!).filter(Boolean);
  }

  return { healthChecks };
}
