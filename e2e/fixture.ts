/* Reads reference/fixture/ (the saved live pull of the owner's league) for the smoke test.
   Nothing here is tied to a user or league: the username, league id and capture time all come from manifest.json. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const FIXTURE_DIR = resolve(import.meta.dirname, '../reference/fixture');
export const NFLVERSE_DIR = resolve(FIXTURE_DIR, 'nflverse');

export interface Manifest {
  captured_at: number;
  username: string;
  user_id: string;
  league_id: string;
  season: string;
  week: number;
  season_type: string;
  files: Record<string, string>;
}

export const manifest: Manifest = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'manifest.json'), 'utf8'));

const cache = new Map<string, unknown>();
/** The parsed JSON of a gzipped fixture file. */
export function fixtureJson<T = unknown>(file: string): T {
  if (!cache.has(file)) cache.set(file, JSON.parse(gunzipSync(readFileSync(resolve(FIXTURE_DIR, file))).toString('utf8')));
  return cache.get(file) as T;
}

/** The gunzipped body (as text) saved for a full request URL, or null when the fixture never captured it.
    Chrome may encode characters differently from the capture, so a decoded comparison is the fallback. */
export function bodyForUrl(url: string): string | null {
  let file = manifest.files[url];
  if (!file) {
    const dec = safeDecode(url);
    const hit = Object.keys(manifest.files).find((k) => safeDecode(k) === dec);
    if (hit) file = manifest.files[hit];
  }
  if (!file) return null;
  return gunzipSync(readFileSync(resolve(FIXTURE_DIR, file))).toString('utf8');
}

function safeDecode(u: string): string {
  try { return decodeURI(u); } catch { return u; }
}

export function nflverseBody(file: string): string | null {
  if (!/^[\w.-]+\.json$/.test(file)) return null;
  try { return readFileSync(resolve(NFLVERSE_DIR, file), 'utf8'); } catch { return null; }
}

/* ---------- facts read off the fixture ---------- */
export const leagueFile = () => fixtureJson<{ league_id: string; name: string; settings: Record<string, number> }>(manifest.files[`https://api.sleeper.app/v1/league/${manifest.league_id}`]);

/** The ids the fixture's `players.json` knows by name, so a profile route can be a real player. */
export function pickPlayerWithUsage(): { pid: string; name: string } {
  const players = fixtureJson<Record<string, { first_name?: string; last_name?: string; position?: string; team?: string | null }>>(manifest.files['https://api.sleeper.app/v1/players/nfl']);
  const weekly = JSON.parse(readFileSync(resolve(NFLVERSE_DIR, 'weekly_2026.json'), 'utf8')) as { cols: string[]; rows: Array<Array<number | string | null>> };
  const iPid = weekly.cols.indexOf('pid'), iTgt = weekly.cols.indexOf('tgt');
  const targets = new Map<string, number>();
  for (const r of weekly.rows) targets.set(String(r[iPid]), (targets.get(String(r[iPid])) ?? 0) + Number(r[iTgt] ?? 0));
  const best = [...targets.entries()]
    .filter(([pid]) => players[pid]?.last_name && ['WR', 'TE', 'RB'].includes(players[pid].position ?? ''))
    .sort((a, b) => b[1] - a[1])[0];
  if (!best) throw new Error('No player in the nflverse snapshot joins to the fixture players file.');
  const p = players[best[0]];
  return { pid: best[0], name: `${p.first_name ?? ''} ${p.last_name}`.trim() };
}
