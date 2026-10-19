/* Saves one full Sleeper pull to reference/fixture/ so tests (and the milestone 2 regression test against
   the reference engine) run fully offline.
   Usage: npm run fixture:capture -- --user <username> --league <league_id> [--out <dir>]
          npm run fixture:capture -- --only fantasycalc [--out <dir>]
   The second form adds FantasyCalc values to an existing fixture (league and params come from its manifest) and
   re-captures nothing else.
          npm run fixture:capture -- --only brackets [--out <dir>]
   Adds the league's winners_bracket and losers_bracket to an existing fixture, nothing else.
          npm run fixture:capture -- --only scores [--out <dir>]
   Adds Sleeper's undocumented NFL scores for weeks 1 to (fixture week + 1): the nfl page, game day's week picker and the live
   poller read them. Played weeks are saved as received; the fixture week and the next one are rewritten to the fixture's own
   moment (see scoresAsOf).
          npm run fixture:capture -- --only nflverse [--out <dir>] [--src <dir>]
   Copies a snapshot of the nightly nflverse pipeline output (public/data/nflverse by default; generated first if it
   is missing) into <out>/nflverse/, so the Playwright smoke test is offline and deterministic.
   Nothing here is tied to a particular user or league: both come from the arguments. */
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { NflState, SleeperDraft, SleeperLeague, SleeperUser } from '../src/data/contract.ts';
import { createLimiter } from '../src/data/limiter.ts';
import { planPull } from '../src/data/plan.ts';
import { browserTransport } from '../src/data/transport.ts';
import { fantasyCalcUrl, sleeperUrls } from '../src/data/urls.ts';
import { fantasyCalcParams } from '../src/engine/draft/fantasycalc.ts';

export function parseArgs(argv: string[]): { user: string; league: string; out: string } {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const user = get('user');
  const league = get('league');
  if (!user || !league) throw new Error('Usage: npm run fixture:capture -- --user <username> --league <league_id> [--out <dir>]');
  return { user, league, out: resolve(get('out') ?? 'reference/fixture') };
}

/** `--only <what>`: restricts a run to one add-on ("fantasycalc", "brackets" or "nflverse"). */
export function parseOnly(argv: string[]): string | undefined {
  const i = argv.indexOf('--only');
  return i >= 0 ? argv[i + 1] : undefined;
}

export const outDirOf = (argv: string[]): string => {
  const i = argv.indexOf('--out');
  return resolve((i >= 0 ? argv[i + 1] : undefined) ?? 'reference/fixture');
};

/** The two FantasyCalc requests saved for a league: its own params (redraft or dynasty as configured) and the same params
    with the other `isDynasty` value, so the fixture holds both flavours. */
export function fantasyCalcRequests(league: SleeperLeague): Array<{ name: string; url: string }> {
  const p = fantasyCalcParams(league);
  const mine = { name: p.isDynasty ? 'fantasycalc_dynasty' : 'fantasycalc_redraft', url: fantasyCalcUrl(p) };
  const other = { name: p.isDynasty ? 'fantasycalc_redraft' : 'fantasycalc_dynasty', url: fantasyCalcUrl({ ...p, isDynasty: !p.isDynasty }) };
  return [mine, other];
}

/** Fetch FantasyCalc values and add them to the existing manifest; nothing else is touched. */
async function captureFantasyCalc(out: string) {
  const manifestPath = resolve(out, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { league_id: string; files: Record<string, string>; failed?: Record<string, string> };
  const leagueFile = manifest.files[sleeperUrls.league(manifest.league_id)];
  if (!leagueFile) throw new Error('The fixture has no league file; capture the fixture first.');
  const league = JSON.parse(gunzipSync(await readFile(resolve(out, leagueFile))).toString('utf8')) as SleeperLeague;
  const limiter = createLimiter();
  for (const { name, url } of fantasyCalcRequests(league)) {
    const res = await limiter.run(() => browserTransport(url));
    if (res.status !== 200 || !Array.isArray(res.body)) throw new Error(`FantasyCalc answered HTTP ${res.status} for ${url}`);
    await writeFile(resolve(out, `${name}.json.gz`), gzipSync(JSON.stringify(res.body)));
    manifest.files[url] = `${name}.json.gz`;
    console.log(`  ${name}: ${res.body.length} rows (${url})`);
  }
  manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Added FantasyCalc to ${manifestPath}`);
}

/** The two playoff-bracket requests saved for a league, with the file each is stored under. */
export function bracketRequests(leagueId: string): Array<{ name: string; url: string }> {
  return [
    { name: 'winners_bracket', url: sleeperUrls.winnersBracket(leagueId) },
    { name: 'losers_bracket', url: sleeperUrls.losersBracket(leagueId) },
  ];
}

/** Fetch both playoff brackets and add them to the existing manifest; nothing else is touched. */
async function captureBrackets(out: string) {
  const manifestPath = resolve(out, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { league_id: string; files: Record<string, string> };
  const limiter = createLimiter();
  for (const { name, url } of bracketRequests(manifest.league_id)) {
    const res = await limiter.run(() => browserTransport(url));
    // Sleeper answers `[]` or `null` before the playoffs; both are saved as received (the client turns null into [])
    if (res.status !== 200 || !(res.body === null || Array.isArray(res.body))) throw new Error(`Sleeper answered HTTP ${res.status} (or a non-list) for ${url}`);
    await writeFile(resolve(out, `${name}.json.gz`), gzipSync(JSON.stringify(res.body)));
    manifest.files[url] = `${name}.json.gz`;
    console.log(`  ${name}: ${Array.isArray(res.body) ? res.body.length : 0} games (${url})`);
  }
  manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Added the brackets to ${manifestPath}`);
}

/** Rewrite a scores response to how it looked at `capturedAt` (epoch ms). Sleeper only serves the live state, so a capture made
    after the fixture moment shows games that had not kicked off then as final. Every game that kicks off AFTER `capturedAt` goes
    back to pre-game (status pre_game, no scores, no clock, quarter-by-quarter lines and in-game flags cleared) and keeps its real
    `start_time`, `date`, teams, spread and weather. A game that kicked off at or before `capturedAt` is left as received: for the
    Oct 16 fixture that is Thursday night's game, which was already final. */
export function scoresAsOf<T extends { status?: string; start_time?: number; metadata?: Record<string, unknown> | null }>(rows: readonly T[], capturedAt: number): T[] {
  return rows.map((g) => {
    const kickoff = typeof g.start_time === 'number' ? g.start_time : Date.parse(String(g.metadata?.date_time ?? ''));
    if (!Number.isFinite(kickoff) || kickoff <= capturedAt) return g;
    const m: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(g.metadata ?? {})) {
      // drop the per-quarter and overtime score lines and the in-game state; everything else (teams, kickoff, venue, spread) stays
      if (/^(home|away)_score_/.test(k) || /_used_timeouts$/.test(k) || ['down', 'down_and_distance', 'possession', 'yard_line'].includes(k)) continue;
      m[k] = v;
    }
    Object.assign(m, {
      is_over: false, is_in_progress: false, home_score: 0, away_score: 0, quarter: '', quarter_num: 0, time_remaining: '15:00',
      has2nd_quarter_started: false, has3rd_quarter_started: false, has4th_quarter_started: false, is_overtime: false,
    });
    return { ...g, status: 'pre_game', metadata: m };
  });
}

/** Weeks whose scores the app reads: every played week (the nfl page and game day's week picker), the fixture week, and the next
    week (the live poller rests until its first kickoff). */
export function scoreWeeks(week: number, lastWeek = 18): number[] {
  return Array.from({ length: Math.min(lastWeek, week + 1) }, (_, i) => i + 1);
}

/** Fetch scores for weeks 1 to (fixture week + 1). Weeks before the fixture week are saved as received. The fixture week and
    the week after are rewritten to the fixture moment (scoresAsOf), so a capture made later cannot show them as played. */
async function captureScores(out: string) {
  const manifestPath = resolve(out, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { season: string; week: number; captured_at: number | string; files: Record<string, string> };
  const capturedAt = typeof manifest.captured_at === 'number' ? manifest.captured_at : Date.parse(manifest.captured_at);
  const limiter = createLimiter();
  for (const week of scoreWeeks(manifest.week)) {
    const url = sleeperUrls.scores(manifest.season, week);
    const res = await limiter.run(() => browserTransport(url));
    if (res.status !== 200 || !Array.isArray(res.body)) { console.warn(`  skipped week ${week}: HTTP ${res.status} (or a non-list) for ${url}`); continue; }
    const rewrite = week >= manifest.week;
    const rows = rewrite ? scoresAsOf(res.body, capturedAt) : res.body;
    const name = `scores_w${String(week).padStart(2, '0')}`;
    await writeFile(resolve(out, `${name}.json.gz`), gzipSync(JSON.stringify(rows)));
    manifest.files[url] = `${name}.json.gz`;
    const pre = rows.filter((g: { status?: string }) => g.status === 'pre_game').length;
    console.log(`  ${name}: ${rows.length} games, ${pre} pre-game${rewrite ? ` (rewritten to ${new Date(capturedAt).toISOString()})` : ' (as received)'}`);
  }
  manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Added the scores to ${manifestPath}`);
}

/** `--src <dir>`: where the pipeline output lives (default public/data/nflverse). */
export const srcDirOf = (argv: string[]): string => {
  const i = argv.indexOf('--src');
  return resolve((i >= 0 ? argv[i + 1] : undefined) ?? 'public/data/nflverse');
};

/** Copy the nflverse pipeline's JSON output into <out>/nflverse/. Plain JSON, not gzip: the app's loader fetches
    ./data/nflverse/*.json, so the smoke test can serve each file as-is (~0.5 MB in all). */
async function captureNflverse(out: string, src: string) {
  const hasManifest = await stat(resolve(src, 'manifest.json')).then(() => true, () => false);
  if (!hasManifest) {
    console.log(`${src} is missing; generating it with the nflverse pipeline (downloads from GitHub, can take a minute)...`);
    const r = spawnSync('npm', ['run', 'data:nflverse', '--', '--out', src, '--cache', '.cache/nflverse'], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('The nflverse pipeline failed; see its output above.');
  }
  const dest = resolve(out, 'nflverse');
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  let total = 0;
  const files = (await readdir(src)).filter((f) => f.endsWith('.json')).sort();
  if (!files.includes('manifest.json')) throw new Error(`No manifest.json in ${src}.`);
  for (const f of files) {
    await copyFile(resolve(src, f), resolve(dest, f));
    total += (await stat(resolve(dest, f))).size;
    console.log(`  ${f}`);
  }
  console.log(`Copied ${files.length} nflverse files (${(total / 1e6).toFixed(2)} MB) to ${dest}`);
}

async function main() {
  const only = parseOnly(process.argv.slice(2));
  if (only === 'fantasycalc') return captureFantasyCalc(outDirOf(process.argv.slice(2)));
  if (only === 'brackets') return captureBrackets(outDirOf(process.argv.slice(2)));
  if (only === 'scores') return captureScores(outDirOf(process.argv.slice(2)));
  if (only === 'nflverse') return captureNflverse(outDirOf(process.argv.slice(2)), srcDirOf(process.argv.slice(2)));
  if (only) throw new Error(`Unknown --only value "${only}" (supported: fantasycalc, brackets, scores, nflverse).`);
  const { user: username, league: leagueId, out } = parseArgs(process.argv.slice(2));
  const limiter = createLimiter();
  const files: Record<string, string> = {};
  const failed: Record<string, string> = {};
  const writes: Promise<void>[] = [];
  await mkdir(out, { recursive: true });
  // start clean so a re-capture never leaves files from an older pull behind
  for (const f of await readdir(out)) if (f.endsWith('.json.gz') || f === 'manifest.json') await rm(resolve(out, f));

  /* GET url, save it as <name>.json.gz, return the parsed body (null on failure) */
  async function grab<T = unknown>(name: string, url: string): Promise<T | null> {
    try {
      const res = await limiter.run(() => browserTransport(url));
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const file = `${name}.json.gz`;
      files[url] = file;
      writes.push(writeFile(resolve(out, file), gzipSync(JSON.stringify(res.body))));
      return res.body as T;
    } catch (e) {
      failed[url] = e instanceof Error ? e.message : String(e);
      console.warn(`  failed: ${url} (${failed[url]})`);
      return null;
    }
  }
  const must = <T>(v: T | null, what: string): T => {
    if (v === null || v === undefined) throw new Error(`Could not fetch ${what}; the fixture would be useless without it.`);
    return v;
  };
  const wk = (w: number) => String(w).padStart(2, '0');

  const state = must(await grab<NflState>('state', sleeperUrls.state()), 'NFL state');
  const season = state.league_season || state.season;
  const user = await grab<SleeperUser | null>('user', sleeperUrls.user(username));
  if (!user?.user_id) throw new Error(`Sleeper has no user named "${username}".`);
  const prevSeason = state.previous_season || String(Number(season) - 1);
  const [leagues] = await Promise.all([
    grab<SleeperLeague[]>(`leagues_${season}`, sleeperUrls.userLeagues(user.user_id, season)),
    grab(`leagues_${prevSeason}`, sleeperUrls.userLeagues(user.user_id, prevSeason)),
  ]);
  const league = must(await grab<SleeperLeague>('league', sleeperUrls.league(leagueId)), `league ${leagueId}`);
  if (league.league_id !== leagueId) throw new Error(`Sleeper returned league ${league.league_id}, expected ${leagueId}.`);
  void leagues;

  const plan = planPull(state, league);
  console.log(`season ${season}, week ${state.week} (${state.season_type}); stats weeks ${plan.statWeeks.at(0)}-${plan.statWeeks.at(-1)}, projections ${[...plan.calWeeks, ...plan.projWeeks].length} weeks`);

  const jobs: Array<Promise<unknown>> = [
    grab('rosters', sleeperUrls.rosters(leagueId)),
    grab('users', sleeperUrls.users(leagueId)),
    grab('traded_picks', sleeperUrls.tradedPicks(leagueId)),
    ...bracketRequests(leagueId).map(({ name, url }) => grab(name, url)),
    // game day, the ticker and the nfl page: NFL scores for every played week, this week and next (captured at the fixture moment)
    ...scoreWeeks(state.week).map((w) => grab(`scores_w${wk(w)}`, sleeperUrls.scores(season, w))),
    grab('schedule', sleeperUrls.schedule(season)),
    grab('trending_add_72h', sleeperUrls.trending('add', 72, 50)),
    grab('trending_add_24h', sleeperUrls.trending('add', 24, 50)),
    grab('trending_drop_24h', sleeperUrls.trending('drop', 24, 50)),
    grab('season_projections', sleeperUrls.seasonProjections(season, plan.positions)),
    grab('players', sleeperUrls.players()),
    ...plan.matchWeeks.map((w) => grab(`matchups_w${wk(w)}`, sleeperUrls.matchups(leagueId, w))),
    ...plan.statWeeks.map((w) => grab(`stats_w${wk(w)}`, sleeperUrls.stats(season, w))),
    ...[...plan.calWeeks, ...plan.projWeeks].map((w) => grab(`projections_w${wk(w)}`, sleeperUrls.projections(season, w, plan.positions))),
    ...plan.completedWeeks.map((w) => grab(`transactions_w${wk(w)}`, sleeperUrls.transactions(leagueId, w))),
    (async () => {
      const drafts = await grab<SleeperDraft[]>('drafts', sleeperUrls.drafts(leagueId));
      await Promise.all((drafts ?? []).flatMap((d) => [
        grab(`draft_${d.draft_id}`, sleeperUrls.draft(d.draft_id)),
        grab(`draft_picks_${d.draft_id}`, sleeperUrls.draftPicks(d.draft_id)),
        grab(`draft_traded_picks_${d.draft_id}`, sleeperUrls.draftTradedPicks(d.draft_id)),
      ]));
    })(),
  ];
  await Promise.all(jobs);
  await Promise.all(writes);

  // the reference engine tolerates a failed trending call; anything else missing is a bad capture
  const required = [sleeperUrls.rosters(leagueId), sleeperUrls.users(leagueId), sleeperUrls.schedule(season)];
  for (const u of required) if (!files[u]) throw new Error(`Required response missing: ${u}`);

  const manifest = {
    captured_at: Date.now(),
    username,
    user_id: user.user_id,
    league_id: leagueId,
    season,
    week: state.week,
    season_type: state.season_type,
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
    ...(Object.keys(failed).length ? { failed } : {}),
  };
  await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  let total = 0;
  const names = await readdir(out);
  for (const f of names) total += (await stat(resolve(out, f))).size;
  console.log(`Saved ${Object.keys(files).length} responses (${names.length} files, ${(total / 1e6).toFixed(2)} MB) to ${out}`);
  if (Object.keys(failed).length) console.log(`${Object.keys(failed).length} request(s) failed; listed under "failed" in manifest.json`);
}

/* only run when invoked directly, so tests can import parseArgs */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
