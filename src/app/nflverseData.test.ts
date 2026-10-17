import { describe, expect, it } from 'vitest';
import { createFakeNflverse, sampleNflverseBundle } from '../test/fakes';
import { loadNflverseBundle } from './nflverseData';

describe('loadNflverseBundle', () => {
  it('decodes the client files into rows', async () => {
    const b = await loadNflverseBundle(createFakeNflverse());
    expect(b.weekly.filter((w) => w.pid === 't1wr')).toHaveLength(6);
    expect(b.weekly[0]).toMatchObject({ pid: 't1wr', week: 1 });
    expect(b.season[0]).toMatchObject({ pid: 't1wr', games: 6 });
    expect(b.coverage).toMatchObject({ season: 2025, isCurrent: false });
    expect(b.coverage!.rows[0]).toMatchObject({ pid: 't1wr', routes: 520 });
    expect(b.unmatched).toHaveLength(2);
    expect(b.asOf).toBe(Date.parse('2026-10-16T09:20:00Z'));
  });

  it('passes force to every file', async () => {
    const c = createFakeNflverse();
    await loadNflverseBundle(c, { force: true });
    expect(c.manifest).toHaveBeenCalledWith({ force: true });
    expect(c.coverage).toHaveBeenCalledWith({ force: true });
  });

  it('throws the client’s message when the files are not there yet', async () => {
    await expect(loadNflverseBundle(createFakeNflverse({ missing: true }))).rejects.toThrow(/not available yet/);
  });

  it('copes with no coverage file', async () => {
    const b = await loadNflverseBundle(createFakeNflverse({ bundle: () => ({ ...sampleNflverseBundle(), coverage: null }) }));
    expect(b.coverage).toBeNull();
    expect(b.weekly.length).toBeGreaterThan(0);
  });
});
