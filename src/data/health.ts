/* Endpoint health checks for Settings → Data health. Hits every endpoint in SPEC section 4 once and
   says, in plain English, what works and what breaks. Undocumented Sleeper endpoints that fail name the
   features that depend on them. nflverse is not probed directly (no CORS on GitHub releases): its rows read the
   nightly job's manifest instead. Network goes through the shared limiter. */
import type { HealthContext, HealthResult } from './contract.ts';
import type { Limiter } from './limiter.ts';
import type { NflverseClient, NvResult } from './nflverse.ts';
import type { NflverseManifest, NflverseSource } from './nflverseTypes.ts';
import { shapes, type Guard } from './shapes.ts';
import type { SleeperClient } from './sleeper.ts';
import type { Transport } from './transport.ts';
import { fantasyCalcUrl, sleeperUrls } from './urls.ts';

export interface HealthDeps {
  transport: Transport;
  limiter: Limiter;
  client: SleeperClient;
  nflverse: NflverseClient;
  now: () => number;
}

interface Spec {
  id: string;
  label: string;
  url: string;
  documented: boolean;
  source: HealthResult['source'];
  guard?: Guard<unknown>;
  /** what the rows are, for the ok message */
  noun?: string;
  /** what stops working if this endpoint breaks */
  impact: string;
  /** an empty but well-formed answer is a warning with this text */
  emptyWarn?: string;
  /** body may legitimately be null */
  nullOk?: boolean;
  onBody?: (body: unknown) => void;
}

const size = (b: unknown) => (Array.isArray(b) ? b.length : b && typeof b === 'object' ? Object.keys(b).length : 0);
const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function createHealth(deps: HealthDeps) {
  const { transport, limiter, client, nflverse, now } = deps;

  const result = (s: Pick<Spec, 'id' | 'label' | 'url' | 'documented' | 'source'>, r: Partial<HealthResult> & Pick<HealthResult, 'level' | 'message'>): HealthResult => ({
    id: s.id, label: s.label, url: s.url, documented: s.documented, source: s.source,
    httpStatus: null, ms: 0, bytes: 0, checkedAt: now(), ...r,
  });

  async function probe(s: Spec): Promise<HealthResult> {
    const t0 = now();
    let res;
    try {
      res = await limiter.run(() => transport(s.url));
    } catch (e) {
      const ms = now() - t0;
      return result(s, { level: 'fail', message: `Could not reach ${s.label}: ${e instanceof Error ? e.message : String(e)}. ${s.impact}`, ms });
    }
    const base = { httpStatus: res.status, ms: res.ms, bytes: res.bytes };
    if (res.status !== 200) {
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

  /* ---------- nflverse (the nightly job) ---------- */

  const HOUR = 3_600_000;
  const ageText = (ms: number) => (ms < 48 * HOUR ? `${Math.max(0, Math.round(ms / HOUR))} h` : `${Math.round(ms / (24 * HOUR))} days`);
  const SOURCES: Array<{ id: NflverseSource['id']; rowId: string; label: string; impact: string }> = [
    { id: 'pbp', rowId: 'nflverse.pbp', label: 'Play-by-play', impact: 'Target, air-yards and red-zone stats depend on this.' },
    { id: 'snap_counts', rowId: 'nflverse.snapCounts', label: 'Snap counts', impact: 'Snap share depends on this.' },
    { id: 'ftn_charting', rowId: 'nflverse.ftn', label: 'FTN charting', impact: 'Blitz, play-action, screen, contested-catch and box splits depend on this.' },
    { id: 'players', rowId: 'nflverse.players', label: 'nflverse player IDs', impact: 'Joining nflverse stats to Sleeper players depends on this.' },
  ];

  function nflverseChecks(ctx: HealthContext): Array<[string, () => Promise<HealthResult>]> {
    let loaded: Promise<NvResult<NflverseManifest>> | null = null;
    // one live read of the manifest shared by every row below (force: a health check must not report a cached copy as current)
    const getManifest = () => (loaded ??= nflverse.manifest({ force: true }));
    const nv = { documented: true, source: 'nflverse' as const };
    const manifestUrl = nflverse.urlOf('manifest.json');
    const row = (id: string, label: string, url: string, r: Partial<HealthResult> & Pick<HealthResult, 'level' | 'message'>) => result({ id, label, url, ...nv }, r);
    const withManifest = (id: string, label: string, url: string, fn: (m: NflverseManifest) => HealthResult): [string, () => Promise<HealthResult>] =>
      [id, async () => {
        const m = await getManifest();
        return m.available ? fn(m.data) : row(id, label, url, { level: 'warn', message: 'Skipped: the nflverse data job has no manifest yet.' });
      }];

    const out: Array<[string, () => Promise<HealthResult>]> = [];
    out.push(['nflverse.manifest', async () => {
      const m = await getManifest();
      const label = 'nflverse data job';
      if (!m.available) {
        return row('nflverse.manifest', label, manifestUrl, {
          level: 'fail', httpStatus: m.reason === 'not_found' ? 404 : null,
          message: `${m.message} Run \`npm run data:nflverse\` locally, or wait for the nightly job. Snap share, target share, route and coverage splits depend on this.`,
        });
      }
      const d = m.data;
      const mismatch = String(d.season) !== ctx.season;
      return row('nflverse.manifest', label, manifestUrl, {
        level: mismatch ? 'warn' : 'ok', httpStatus: 200,
        message: mismatch
          ? `The data job built ${d.season}, but the app is on ${ctx.season}. Wait for the next nightly run.`
          : `Built ${d.generatedAt.slice(0, 16).replace('T', ' ')} UTC for ${d.season}, through week ${d.throughWeek}.`,
      });
    }]);
    out.push(withManifest('nflverse.age', 'nflverse data age', manifestUrl, (d) => {
      const age = now() - Date.parse(d.generatedAt);
      if (!Number.isFinite(age)) return row('nflverse.age', 'nflverse data age', manifestUrl, { level: 'fail', message: 'The manifest has no readable build time.' });
      const level = age < 36 * HOUR ? 'ok' : age < 7 * 24 * HOUR ? 'warn' : 'fail';
      return row('nflverse.age', 'nflverse data age', manifestUrl, {
        level,
        message: level === 'ok' ? `Updated ${ageText(age)} ago.`
          : `Updated ${ageText(age)} ago; the nightly job has not run since. Usage stats are out of date.`,
      });
    }));
    for (const s of SOURCES) {
      out.push(withManifest(s.rowId, s.label, manifestUrl, (d) => {
        const src = d.sources.find((x) => x.id === s.id);
        if (!src) return row(s.rowId, s.label, manifestUrl, { level: 'fail', message: `${s.label} is missing from the manifest. ${s.impact}` });
        return row(s.rowId, `${s.label}${src.season ? ` ${src.season}` : ''}`, src.url, {
          level: 'ok', bytes: src.bytes,
          message: `${src.name}, ${kb(src.bytes)}${src.lastModified ? `, published ${src.lastModified}` : ''}${src.fromCache ? ' (unchanged since the last run)' : ''}.`,
        });
      }));
    }
    out.push(withManifest('nflverse.participation', 'Participation (routes, man/zone)', manifestUrl, (d) => {
      const src = d.sources.find((x) => x.id === 'pbp_participation');
      const impact = 'Route and coverage splits depend on this.';
      if (!src) return row('nflverse.participation', 'Participation', manifestUrl, { level: 'fail', message: `Participation is missing from the manifest. ${impact}` });
      const label = `Participation ${d.participationSeason}`;
      if (d.participationIsCurrent) return row('nflverse.participation', label, src.url, { level: 'ok', bytes: src.bytes, message: `${src.name}, ${kb(src.bytes)}.` });
      return row('nflverse.participation', label, src.url, {
        level: 'warn', bytes: src.bytes,
        message: `${d.participationSeason}, labeled last season; ${d.season} not published yet. Panels switch over on their own once it appears.`,
      });
    }));
    out.push(withManifest('nflverse.unmatched', 'Unmatched players', nflverse.urlOf('unmatched.json'), (d) => {
      const id = 'nflverse.unmatched';
      const url = nflverse.urlOf('unmatched.json');
      const detail = `${d.matched} Sleeper players joined (${d.matchMethods.gsis} by gsis_id, ${d.matchMethods.espn} by espn_id, ${d.matchMethods.name_team_pos + d.matchMethods.name_pos} by name)`;
      return d.unmatchedCount > 0
        ? row(id, 'Unmatched players', url, { level: 'warn', message: `${d.unmatchedCount} player${d.unmatchedCount === 1 ? '' : 's'} with snaps or targets could not be joined to Sleeper and show no nflverse stats. ${detail}.` })
        : row(id, 'Unmatched players', url, { level: 'ok', message: `Every player with snaps or targets joined. ${detail}.` });
    }));
    return out;
  }

  async function healthChecks(ctx: HealthContext): Promise<HealthResult[]> {
    const season = ctx.season;
    const week = Math.max(1, ctx.week);
    const prevWeek = Math.max(1, week - 1);
    const L = ctx.leagueId;
    let draftId = ctx.draftId;
    const sl = { documented: true, source: 'sleeper' as const };
    const un = { documented: false, source: 'sleeper' as const };
    const fc = { documented: true, source: 'fantasycalc' as const };
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

    /* nflverse: read through the nightly job's manifest, not the GitHub release URLs */
    for (const [id, fn] of nflverseChecks(ctx)) add(id, fn);

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
