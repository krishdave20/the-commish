/* Shared builders for the data-layer tests: tiny valid responses and a scriptable fake transport. */
import type { Transport, TransportResult } from './transport.ts';

export const league = (over: Record<string, unknown> = {}) => ({
  league_id: 'L1', name: 'Test League', season: '2026', status: 'in_season', total_rosters: 2,
  roster_positions: ['QB', 'RB', 'FLEX', 'BN'], scoring_settings: { rec: 1 }, settings: { playoff_week_start: 15 },
  previous_league_id: null, draft_id: 'D1', avatar: null, metadata: null, ...over,
});
export const roster = (id: number) => ({ roster_id: id, owner_id: `u${id}`, players: ['1'], starters: ['1'], reserve: null, settings: { wins: 1 } });
export const leagueUser = (id: number) => ({ user_id: `u${id}`, display_name: `Manager ${id}`, avatar: null });
export const draft = (over: Record<string, unknown> = {}) => ({ draft_id: 'D1', league_id: 'L1', season: '2026', status: 'complete', type: 'snake', start_time: 1, settings: {}, draft_order: null, ...over });
export const nflState = (over: Record<string, unknown> = {}) => ({ week: 6, season: '2026', season_type: 'regular', league_season: '2026', previous_season: '2025', ...over });

export const ok = (body: unknown, bytes = 100): TransportResult => ({ status: 200, body, bytes, ms: 5 });
export const status = (s: number, body: unknown = null): TransportResult => ({ status: s, body, bytes: 0, ms: 1 });

export interface FakeTransport extends Transport {
  calls: Array<{ url: string; method: string }>;
  /** replace or add a route; a function result may throw to simulate a network failure */
  set(match: string | RegExp, res: TransportResult | (() => TransportResult | Promise<TransportResult>)): void;
  count(match: string | RegExp): number;
}

/** Routes are tried newest first; the first whose matcher hits the URL wins. No route answers 404. */
export function fakeTransport(initial: Array<[string | RegExp, TransportResult | (() => TransportResult | Promise<TransportResult>)]> = []): FakeTransport {
  const routes = [...initial].reverse();
  const hit = (m: string | RegExp, url: string) => (typeof m === 'string' ? url === m || url.endsWith(m) : m.test(url));
  const t = (async (url: string, init?: { method?: 'GET' | 'HEAD' }) => {
    t.calls.push({ url, method: init?.method ?? 'GET' });
    const r = routes.find(([m]) => hit(m, url));
    if (!r) return status(404);
    return typeof r[1] === 'function' ? r[1]() : r[1];
  }) as FakeTransport;
  t.calls = [];
  t.set = (m, res) => { routes.unshift([m, res]); };
  t.count = (m) => t.calls.filter((c) => hit(m, c.url)).length;
  return t;
}
