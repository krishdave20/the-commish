import { describe, expect, it } from 'vitest';
import { isHeadshot, isNflverseJson, isSleeperApi } from './swRoutes';

const u = (s: string) => new URL(s);

describe('what the service worker may cache', () => {
  it('keeps the nflverse JSON, under any base path', () => {
    expect(isNflverseJson(u('https://krishdave20.github.io/the-commish/data/nflverse/manifest.json'))).toBe(true);
    expect(isNflverseJson(u('http://localhost:4173/data/nflverse/weekly_2026.json?x=1'))).toBe(true);
    expect(isNflverseJson(u('http://localhost:4173/data/nflverse/weekly_2026.csv'))).toBe(false);
    expect(isNflverseJson(u('http://localhost:4173/assets/index.json'))).toBe(false);
  });

  it('keeps Sleeper player headshots and nothing else on the CDN', () => {
    expect(isHeadshot(u('https://sleepercdn.com/content/nfl/players/thumb/4034.jpg'))).toBe(true);
    expect(isHeadshot(u('https://sleepercdn.com/content/nfl/players/4034.jpg'))).toBe(true);
    expect(isHeadshot(u('https://sleepercdn.com/avatars/abc'))).toBe(false);
    expect(isHeadshot(u('https://example.com/content/nfl/players/thumb/4034.jpg'))).toBe(false);
  });

  it('never matches the Sleeper API (its offline copy is the app\'s IndexedDB cache)', () => {
    for (const s of ['https://api.sleeper.app/v1/state/nfl', 'https://api.sleeper.app/v1/players/nfl', 'https://api.sleeper.com/projections/nfl/2026/7']) {
      expect(isSleeperApi(u(s))).toBe(true);
      expect(isNflverseJson(u(s))).toBe(false);
      expect(isHeadshot(u(s))).toBe(false);
    }
  });
});
