/* Saves one full Sleeper pull to reference/fixture/ so tests (and the milestone 2 regression test against
   the reference engine) run fully offline.
   Usage: npm run fixture:capture -- --user <username> --league <league_id> [--out <dir>]
          npm run fixture:capture -- --only fantasycalc [--out <dir>]
   The second form adds FantasyCalc values to an existing fixture (league and params come from its manifest) and
   re-captures nothing else.
          npm run fixture:capture -- --only brackets [--out <dir>]
   Adds the league's winners_bracket and losers_bracket to an existing fixture, nothing else.
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
  if (only === 'nflverse') return captureNflverse(outDirOf(process.argv.slice(2)), srcDirOf(process.argv.slice(2)));
  if (only) throw new Error(`Unknown --only value "${only}" (supported: fantasycalc, brackets, nflverse).`);
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
