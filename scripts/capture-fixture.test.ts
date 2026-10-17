import { describe, expect, it } from 'vitest';
import { parseArgs } from './capture-fixture.ts';

describe('capture-fixture args', () => {
  it('reads user and league from the command line, defaulting the output dir', () => {
    const a = parseArgs(['--user', 'someone', '--league', '123']);
    expect(a).toMatchObject({ user: 'someone', league: '123' });
    expect(a.out.endsWith('reference/fixture')).toBe(true);
  });

  it('takes an explicit output dir', () => {
    expect(parseArgs(['--league', '1', '--user', 'u', '--out', '/tmp/x']).out).toBe('/tmp/x');
  });

  it('refuses to guess a user or league', () => {
    expect(() => parseArgs(['--user', 'u'])).toThrow(/Usage/);
    expect(() => parseArgs([])).toThrow(/Usage/);
  });
});
