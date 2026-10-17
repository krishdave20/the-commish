/* Nightly nflverse job. Downloads nflverse (conditionally) and Sleeper's player map, builds the aggregates in
   pipeline.ts and writes small JSON files that the static site serves same-origin (GitHub release assets send no
   CORS headers, so the browser cannot fetch nflverse itself).
   Usage: npm run data:nflverse -- --out public/data/nflverse [--season 2026] [--cache .cache/nflverse] [--xtd data/xtd_model.json] [--force] */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isXtdModel, type XtdModel } from '../../src/stats/index.ts';
import type { NflverseSource } from '../../src/data/nflverseTypes.ts';
import type { PlayerRecord } from '../../src/data/types.ts';
import { nflverseUrls, sleeperUrls } from '../../src/data/urls.ts';
import { collect, readCsv } from './csv.ts';
import { download, downloadFresh, exists, loadMeta, saveMeta, type DownloadResult, type MetaMap } from './download.ts';
import { buildOutputs } from './pipeline.ts';
import { dropbackMap, participationRows, toFtn, toPlay, toPlayersCsv, toSnap } from './rows.ts';

export interface Args { out: string; season: number | null; cache: string; xtd: string; force: boolean }

export function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const season = get('season');
  if (season !== undefined && !/^\d{4}$/.test(season)) throw new Error('--season must be a four-digit year');
  return {
    out: resolve(get('out') ?? 'public/data/nflverse'),
    season: season ? Number(season) : null,
    cache: resolve(get('cache') ?? '.cache/nflverse'),
    xtd: resolve(get('xtd') ?? 'data/xtd_model.json'),
    force: argv.includes('--force'),
  };
}

const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);

async function readXtd(path: string): Promise<XtdModel | null> {
  try {
    const j: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (isXtdModel(j)) return j;
    log(`xTD model at ${path} has an unexpected shape; xTD fields will be null`);
  } catch { log(`no xTD model at ${path}; xTD fields will be null`); }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = join(args.cache, 'raw');
  const meta: MetaMap = await loadMeta(args.cache);
  const dl = { force: args.force, log };

  // the current season comes from Sleeper unless given. Between seasons Sleeper already says the new year while
  // nflverse has no play-by-play for it yet: fall back to the last season that has some, instead of failing every night.
  let season = args.season;
  if (season === null) {
    const res = await fetch(sleeperUrls.state());
    const st = (await res.json()) as { season?: string };
    if (!st.season) throw new Error('Could not read the season from Sleeper /v1/state/nfl; pass --season');
    season = Number(st.season);
    if (!(await exists(nflverseUrls.pbp(String(season))))) {
      log(`no play-by-play for ${season} yet; using ${season - 1}`);
      season -= 1;
    }
  }
  log(`season ${season}`);

  // participation: this season if published, else the most recent one that is
  let participationSeason: number | null = null;
  for (const s of [season, season - 1, season - 2]) {
    if (await exists(nflverseUrls.participation(String(s)))) { participationSeason = s; break; }
  }
  if (participationSeason === null) throw new Error('No pbp_participation file found for the last three seasons');
  log(`participation season ${participationSeason}${participationSeason === season ? '' : ' (labeled last season)'}`);

  const need = async (url: string, name: string): Promise<DownloadResult> => {
    const r = await download(url, raw, name, meta, dl);
    if (!r) throw new Error(`${url} does not exist (HTTP 404)`);
    return r;
  };
  const S = String(season);
  const P = String(participationSeason);
  // snap counts and FTN charting can trail play-by-play by days early in a season: run without them rather than not at all
  const maybe = async (url: string, name: string): Promise<DownloadResult | null> => {
    const r = await download(url, raw, name, meta, dl);
    if (!r) log(`${name} is not published yet; continuing without it`);
    return r;
  };
  const [pbp, snaps, ftn, players, part, pbpPrev, sleeper] = await Promise.all([
    need(nflverseUrls.pbp(S), `play_by_play_${S}.csv.gz`),
    maybe(nflverseUrls.snapCounts(S), `snap_counts_${S}.csv`),
    maybe(nflverseUrls.ftn(S), `ftn_charting_${S}.csv`),
    need(nflverseUrls.players(), 'players.csv'),
    need(nflverseUrls.participation(P), `pbp_participation_${P}.csv`),
    P === S ? Promise.resolve(null) : need(nflverseUrls.pbp(P), `play_by_play_${P}.csv.gz`),
    downloadFresh(sleeperUrls.players(), raw, 'sleeper_players.json', meta, 18 * 3_600_000, dl),
  ]);
  await saveMeta(args.cache, meta);
  log('downloads done');

  const src = (id: NflverseSource['id'], name: string, url: string, seasonOf: number | null, r: DownloadResult): NflverseSource => ({
    id, name, url, season: seasonOf, etag: r.meta.etag, lastModified: r.meta.lastModified, bytes: r.meta.bytes, fromCache: r.fromCache,
  });
  const sources: NflverseSource[] = [
    src('pbp', `play_by_play_${S}.csv.gz`, nflverseUrls.pbp(S), season, pbp),
    ...(snaps ? [src('snap_counts', `snap_counts_${S}.csv`, nflverseUrls.snapCounts(S), season, snaps)] : []),
    ...(ftn ? [src('ftn_charting', `ftn_charting_${S}.csv`, nflverseUrls.ftn(S), season, ftn)] : []),
    src('players', 'players.csv', nflverseUrls.players(), null, players),
    src('pbp_participation', `pbp_participation_${P}.csv`, nflverseUrls.participation(P), participationSeason, part),
    ...(pbpPrev ? [src('pbp_prev', `play_by_play_${P}.csv.gz`, nflverseUrls.pbp(P), participationSeason, pbpPrev)] : []),
    src('sleeper_players', 'sleeper_players.json', sleeperUrls.players(), null, sleeper),
  ];

  const plays = await collect(readCsv(pbp.path), toPlay);
  log(`pbp ${S}: ${plays.length} plays`);
  const ftnMap = new Map(ftn ? await collect(readCsv(ftn.path), toFtn) : []);
  const snapRows = snaps ? await collect(readCsv(snaps.path), toSnap) : [];
  const playersCsv = await collect(readCsv(players.path), toPlayersCsv);
  log(`ftn ${ftnMap.size}, snaps ${snapRows.length}, players.csv ${playersCsv.length}`);

  const partPlays = dropbackMap(P === S ? plays : await collect(readCsv(pbpPrev!.path), toPlay));
  log(`participation-season dropbacks ${partPlays.size}`);

  const sleeperPlayers = JSON.parse(await readFile(sleeper.path, 'utf8')) as Record<string, PlayerRecord>;
  const xtd = await readXtd(args.xtd);

  const out = await buildOutputs({
    season, participationSeason, generatedAt: new Date().toISOString(), plays, ftn: ftnMap, snaps: snapRows, playersCsv, sleeperPlayers, xtd,
    partPlays, partRows: () => participationRows(readCsv(part.path)), sources,
  });

  await mkdir(args.out, { recursive: true });
  for (const f of await readdir(args.out)) {
    if (/^coverage_\d{4}\.json$/.test(f) && !(f in out.files)) await rm(join(args.out, f));
  }
  // manifest last, so a reader never sees a manifest that points at files not written yet
  const names = Object.keys(out.files).filter((n) => n !== 'manifest.json');
  for (const n of names) await writeFile(join(args.out, n), out.files[n]);
  await writeFile(join(args.out, 'manifest.json'), out.files['manifest.json']);

  const m = out.manifest;
  log(`wrote ${names.length + 1} files to ${args.out}`);
  for (const n of [...names, 'manifest.json']) console.log(`  ${n.padEnd(22)} ${(Buffer.byteLength(out.files[n]) / 1024).toFixed(0).padStart(6)} KB`);
  console.log(`  total ${(Object.values(out.files).reduce((s, v) => s + Buffer.byteLength(v), 0) / 1e6).toFixed(2)} MB`);
  console.log(`matched ${m.matched} Sleeper players`, m.matchMethods, `| id conflicts: ${m.idConflicts} | unmatched with snaps/targets: ${m.unmatchedCount}`);
  console.log(`through week ${m.throughWeek}, FTN join rate ${m.ftnJoinRate}, xTD model ${m.xtd.available ? `v${m.xtd.version} (${m.xtd.fitSeason})` : 'missing'}`);
  console.log('summary', out.summary);
}

// run only when executed directly, not when a test imports parseArgs
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.stack ?? e.message : e);
    process.exit(1);
  });
}
