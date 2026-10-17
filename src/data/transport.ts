/* The only place that touches the network. Everything above it takes a Transport, so tests and the
   fixture-backed UI tests swap in fixtureTransport and never go online. */

export interface TransportResult { status: number; body: unknown; bytes: number; ms: number }
export type Transport = (url: string, init?: { method?: 'GET' | 'HEAD' }) => Promise<TransportResult>;

/** Network failures reject (fetch throws a TypeError); HTTP errors resolve with their status. */
export const browserTransport: Transport = async (url, init) => {
  const method = init?.method ?? 'GET';
  const t0 = Date.now();
  const res = await fetch(url, { method, cache: 'no-store' });
  if (method === 'HEAD') {
    return { status: res.status, body: null, bytes: Number(res.headers.get('content-length')) || 0, ms: Date.now() - t0 };
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { status: res.status, body, bytes: text.length, ms: Date.now() - t0 };
};

/* ---------- offline fixture ---------- */

export interface FixtureManifest {
  captured_at: number | string;
  username: string;
  user_id: string;
  league_id: string;
  season: string;
  week: number;
  season_type: string;
  /** full URL → file name */
  files: Record<string, string>;
  [k: string]: unknown;
}

export interface FixtureSource {
  manifest: FixtureManifest;
  /** returns the parsed JSON stored in that file */
  load(file: string): Promise<unknown>;
}

/** Serves saved responses. A URL that was never captured answers 404, like a dead endpoint would. */
export function fixtureTransport(src: FixtureSource): Transport {
  return async (url, init) => {
    const file = src.manifest.files[url];
    if (!file) return { status: 404, body: null, bytes: 0, ms: 0 };
    if (init?.method === 'HEAD') return { status: 200, body: null, bytes: 0, ms: 0 };
    const body = await src.load(file);
    return { status: 200, body, bytes: JSON.stringify(body)?.length ?? 0, ms: 0 };
  };
}
