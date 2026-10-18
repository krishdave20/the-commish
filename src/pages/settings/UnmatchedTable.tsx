import type { UnmatchedPlayer, UnmatchedReason } from '../../data/nflverseTypes';
import { formatCount } from '../../app/format';

const WHY: Record<UnmatchedReason, string> = {
  no_candidate: 'no sleeper player has this id, or this name on this team',
  ambiguous: 'two or more players fit, so none was guessed',
  team_mismatch: 'same name and position on another team; birth dates could not confirm',
  duplicate: 'another nflverse player claims the same sleeper player',
};

interface Props {
  players: UnmatchedPlayer[] | null;
  /** how many Sleeper players were joined (from the manifest) */
  matched?: number;
  season?: number;
  loading: boolean;
}

/** nflverse players this season that could not be joined to a Sleeper player, and why. */
export function UnmatchedTable({ players, matched, season, loading }: Props) {
  if (!players) {
    return <p className="note" role="status">{loading ? 'loading the nightly nflverse data…' : 'nflverse data arrives with the nightly update.'}</p>;
  }
  return (
    <div className="stack">
      <p className="note">
        {players.length === 0 ? 'every nflverse player with snaps, targets or carries was matched.'
          : `${players.length} nflverse ${players.length === 1 ? 'player' : 'players'} with offensive snaps, targets or carries in ${season ?? 'this season'} could not be matched to a sleeper player${matched !== undefined ? `; ${formatCount(matched)} were matched` : ''}.`}
      </p>
      {players.length > 0 && (
        <div className="tw">
          <table>
            <caption className="sr-only">Unmatched player ids</caption>
            <thead>
              <tr>
                <th scope="col">name</th><th scope="col">team</th><th scope="col">pos</th>
                <th scope="col" className="n">snaps</th><th scope="col" className="n">targets</th><th scope="col" className="n">carries</th>
                <th scope="col">reason</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.key}>
                  <td className="nowrap">{p.name}</td><td className="dim">{p.team ?? '—'}</td><td className="dim">{p.pos ?? '—'}</td>
                  <td className="n">{p.off_snaps}</td><td className="n">{p.tgt}</td><td className="n">{p.car}</td>
                  <td className="wrap" title={WHY[p.reason]}>
                    <span className="pill mute">{p.reason.replace(/_/g, ' ')}</span>
                    {p.candidates.length > 0 && <span className="dim"> considered {p.candidates.join(', ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
