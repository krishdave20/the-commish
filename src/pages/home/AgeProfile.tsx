import { useMemo } from 'react';
import { usePlayersFile } from '../../app/playersData';
import { ageOf } from '../../app/playersIndex';
import { FEATURE } from '../../app/names';
import { AgeBars } from '../../components/charts/AgeBars';
import type { AgeRow } from '../../components/charts/AgeBars';
import type { LeagueBundle } from '../../data';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];

/** My roster's average age by position, from the players file's birth dates, against the league's rostered average. */
export function AgeProfile({ bundle, userId }: { bundle: LeagueBundle; userId: string | null }) {
  const file = usePlayersFile();
  const { rows, overall, leagueOverall } = useMemo(() => {
    const mine: Record<string, number[]> = {}, all: Record<string, number[]> = {};
    for (const r of bundle.rosters) {
      const isMine = !!userId && (r.owner_id === userId || !!r.co_owners?.includes(userId));
      for (const id of r.players ?? []) {
        const rec = file.data?.[id];
        const pos = rec?.position ?? '';
        if (!rec || !POSITIONS.includes(pos)) continue;
        const age = ageOf(rec);
        if (age === null) continue;
        (all[pos] ??= []).push(age);
        if (isMine) (mine[pos] ??= []).push(age);
      }
    }
    const avg = (xs: number[] | undefined) => (xs && xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    const out: AgeRow[] = POSITIONS.filter((p) => mine[p]?.length).map((p) => ({ pos: p, avg: avg(mine[p])!, league: avg(all[p]), n: mine[p]!.length }));
    return { rows: out, overall: avg(Object.values(mine).flat()), leagueOverall: avg(Object.values(all).flat()) };
  }, [bundle.rosters, file.data, userId]);

  return (
    <section className="card" aria-labelledby="age-title">
      <header>
        <div className="micro">from sleeper’s birth dates</div>
        <h2 id="age-title">{FEATURE.ageProfile}</h2>
      </header>
      {!file.data ? <p className="note" role="status">{file.error ? `could not load the players file. ${file.error}` : 'loading sleeper’s players file…'}</p>
        : rows.length === 0 ? <p className="note">no ages on file for your roster.</p>
        : (
          <>
            <p className="take">
              your roster averages {overall!.toFixed(1)} years old{leagueOverall !== null ? `; the league’s rostered players average ${leagueOverall.toFixed(1)}` : ''}.
            </p>
            <AgeBars rows={rows} />
          </>
        )}
    </section>
  );
}
