// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from './run.ts';

describe('command line', () => {
  it('defaults: public/data/nflverse, .cache/nflverse, data/xtd_model.json, season from Sleeper', () => {
    const a = parseArgs([]);
    expect(a).toEqual({
      out: resolve('public/data/nflverse'), cache: resolve('.cache/nflverse'), xtd: resolve('data/xtd_model.json'), season: null, force: false,
    });
  });
  it('--out, --season, --cache, --xtd, --force', () => {
    const a = parseArgs(['--out', 'x/out', '--season', '2027', '--cache', 'c', '--xtd', 'm.json', '--force']);
    expect(a).toEqual({ out: resolve('x/out'), season: 2027, cache: resolve('c'), xtd: resolve('m.json'), force: true });
  });
  it('rejects a bad season', () => {
    expect(() => parseArgs(['--season', 'next'])).toThrow(/four-digit/);
  });
});
