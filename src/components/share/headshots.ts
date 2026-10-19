/* Headshots for a card. Sleeper's CDN answers with `access-control-allow-origin: *` (checked Oct 18, 2026), so a CORS fetch works and the bytes can
   ride inside the SVG as a data: URL without tainting the canvas. Anything else (offline, blocked, a 403 or 404, a body that is not an image, a
   slow answer) gives null, and the card draws a team-colour monogram for that player instead. Team defenses never get a photo. */
import type { CardPlayer, ImageMap } from '../../engine/share';
import { HEADSHOT_URL } from '../avatarUtils';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The image type from the first bytes (the CDN labels PNGs as jpeg, and an error page is HTML), or null when it is not an image. */
export function sniffImage(b: Uint8Array): string | null {
  if (b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const cache_ = new Map<string, string>();
export function clearHeadshotCache(): void { cache_.clear(); }

/** One headshot as a data: URL, or null when it cannot be had safely. */
export async function fetchHeadshot(pid: string, f: FetchLike = (u, i) => fetch(u, i), timeoutMs = 6000): Promise<string | null> {
  const hit = cache_.get(pid);
  if (hit) return hit;
  if (!/^\d+$/.test(pid)) return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    // An <img> that loaded this file earlier (no Origin header) can leave a cached copy without the CORS header, and the browser then refuses
    // the CORS read of it. The second try goes to the network, where the CDN does send it.
    for (const cache of [undefined, 'reload'] as const) {
      try {
        const res = await f(HEADSHOT_URL(pid), { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl?.signal, ...(cache ? { cache } : {}) });
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        const type = sniffImage(bytes);
        if (!type) return null;
        const url = `data:${type};base64,${toBase64(bytes)}`;
        cache_.set(pid, url);
        return url;
      } catch {
        if (ctl?.signal.aborted) return null;
      }
    }
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Headshots for every player who can have one (a real Sleeper id, not a defense). A player with no entry in the result gets a monogram. */
export async function loadHeadshots(players: readonly CardPlayer[], f?: FetchLike): Promise<ImageMap> {
  const pids = [...new Set(players.filter((p) => p.pos !== 'DEF' && /^\d+$/.test(p.pid)).map((p) => p.pid))];
  const got = await Promise.all(pids.map(async (pid) => [pid, await fetchHeadshot(pid, f)] as const));
  const out: Record<string, string> = {};
  for (const [pid, url] of got) if (url) out[pid] = url;
  return out;
}
