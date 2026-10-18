import { useMemo, useState } from 'react';
import { useActive } from '../app/hooks';
import { useModel } from '../app/modelContext';
import { PAGES } from '../app/names';
import { usePlayerIndex } from '../app/playersData';
import { searchPlayers } from '../app/playersIndex';
import type { PlayerEntry } from '../app/playersIndex';
import { usePageTitle } from '../app/usePageTitle';
import { useWatchlist } from '../app/useWatchlist';
import { PageHeader } from '../components/PageHeader';
import { PlayerLink } from '../components/PlayerLink';
import { MoreColumns } from '../components/MoreColumns';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/Segmented';
import { useMoreColumns } from '../components/useMoreColumns';
import { formatCount } from '../app/format';

type Scope = 'all' | 'mine' | 'rostered' | 'free' | 'watch';
const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: 'all', label: 'all players' },
  { value: 'mine', label: 'my team' },
  { value: 'rostered', label: 'rostered' },
  { value: 'free', label: 'free agents' },
  { value: 'watch', label: 'watchlist' },
];
const POSITIONS = ['all', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/** Scouting report: search every player in Sleeper's players file. */
export default function Players() {
  usePageTitle(PAGES.players.path);
  const players = usePlayerIndex();
  const { model } = useModel();
  const { data: active } = useActive();
  const watch = useWatchlist();
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState('all');
  const [scope, setScope] = useState<Scope>('all');
  const more = useMoreColumns('players');

  const owner = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of model?.players ?? []) m.set(p.pid, p.ownerRid);
    return m;
  }, [model]);
  const rosterOf = useMemo(() => new Map((model?.teams ?? []).map((t) => [t.rid, t.team])), [model]);
  const meRid = model?.meRid ?? -1;
  const rosteredLeague = !!model;

  const results = useMemo(() => {
    const only: Set<string> | null = scope === 'watch' ? new Set(watch.list) : null;
    const filter = (e: PlayerEntry): boolean => {
      if (scope === 'mine') return owner.get(e.pid) === meRid;
      if (scope === 'rostered') return (owner.get(e.pid) ?? 0) > 0;
      if (scope === 'free') return (owner.get(e.pid) ?? 0) === 0 && e.active;
      return true;
    };
    const hits = searchPlayers(players.index, { query, pos, only, filter, limit: 300 });
    if (!query.trim() && (scope === 'mine' || scope === 'free')) {
      // with nothing typed, list by expected rest-of-season points
      const ros = (pid: string) => {
        const mp = model?.players.find((p) => p.pid === pid);
        if (!mp) return 0;
        return Object.values(mp.mu).reduce((s, x) => s + x, 0);
      };
      hits.sort((a, b) => ros(b.pid) - ros(a.pid));
    }
    return hits.slice(0, 50);
  }, [players.index, query, pos, scope, watch.list, owner, meRid, model]);

  const needsQuery = scope === 'all' && !query.trim() && pos === 'all';

  return (
    <div className="page page-fade">
      <PageHeader kicker={PAGES.players.kicker} title={PAGES.players.name} data={players} />
      <section className="card" aria-labelledby="find-title">
        <SectionHeader
          id="find-title" title="find a player"
          tip={players.index.length ? `${formatCount(players.index.length)} players on file, from sleeper’s players file.` : 'loading sleeper’s players file.'}
        />
        <div className="form-row">
          <label className="ctl">
            search players
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name, team or position" autoComplete="off" />
          </label>
        </div>
        <div className="row">
          <Segmented label="Position filter" value={pos} onChange={setPos} options={POSITIONS.map((p) => ({ value: p, label: p === 'all' ? 'all' : p }))} />
          <Segmented label="Player scope" value={scope} onChange={setScope} options={SCOPES} />
        </div>
        {!rosteredLeague && scope !== 'all' && scope !== 'watch' && (
          <p className="note" role="status">{active?.leagueId ? 'your league is still loading, so ownership filters are not ready yet.' : 'follow a league to filter by ownership.'}</p>
        )}
        {players.error && !players.index.length && <p className="note neg-c" role="status">could not load the players file. {players.error}</p>}
        {needsQuery ? (
          <p className="note">type a name, or pick a position or scope, to see players.</p>
        ) : results.length === 0 && !players.loading ? (
          <p className="note">{scope === 'watch' ? 'nobody on your watchlist yet. open a player and add him.' : 'no player matches that search.'}</p>
        ) : (
          <>
          <MoreColumns on={more.on} onToggle={more.toggle} label="player search" />
          <div className="tw">
            <table>
              <caption className="sr-only">Player search results</caption>
              <thead>
                <tr>
                  <th scope="col">player</th><th scope="col">pos</th><th scope="col">team</th>{more.on && <th scope="col" className="n">age</th>}
                  <th scope="col">owner</th><th scope="col"><span className="sr-only">watch</span></th>
                </tr>
              </thead>
              <tbody>
                {results.map((e) => {
                  const rid = owner.get(e.pid);
                  const watching = watch.has(e.pid);
                  return (
                    <tr key={e.pid}>
                      <td className="nowrap">
                        <PlayerLink pid={e.pid} name={e.name} />
                        {e.injury && <> <span className="pill warn">{e.injury}</span></>}
                        {!e.active && <> <span className="pill mute">inactive</span></>}
                      </td>
                      <td className="dim">{e.pos}</td>
                      <td className="dim">{e.team ?? 'fa'}</td>
                      {more.on && <td className="n dim">{e.age ?? '—'}</td>}
                      <td className={rid === meRid ? 'pos-c' : 'dim'}>
                        {!rosteredLeague ? '—' : rid === meRid ? 'my team' : rid ? (rosterOf.get(rid) ?? `team ${rid}`) : 'free agent'}
                      </td>
                      <td>
                        <button type="button" className="tog" aria-pressed={watching}
                          aria-label={`${watching ? 'watching' : 'watch'} ${e.name}`}
                          onClick={() => watch.toggle(e.pid)}>{watching ? 'watching' : 'watch'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}
