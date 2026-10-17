import { useGrown } from '../motion';

export interface AgeRow {
  pos: string;
  /** average age of my players at the position */
  avg: number;
  /** average age of every rostered player at the position, when known */
  league: number | null;
  n: number;
}

const LO = 20, HI = 36;

/** Average age by position as thin bars that grow in (gold when the room is a year or more older than the league's). */
export function AgeBars({ rows }: { rows: AgeRow[] }) {
  const grown = useGrown();
  return (
    <ul className="agebars" aria-label="Average age by position">
      {rows.map((r) => {
        const pct = Math.max(0, Math.min(1, (r.avg - LO) / (HI - LO)));
        const old = r.league !== null && r.avg - r.league >= 1;
        return (
          <li key={r.pos}>
            <span className="micro">{r.pos}</span>
            <div className={old ? 'bar gold' : 'bar'} aria-hidden="true"><i style={{ width: `${grown ? pct * 100 : 0}%` }} /></div>
            <span className="num">{r.avg.toFixed(1)}</span>
            <span className="dim">{r.n} {r.n === 1 ? 'player' : 'players'}{r.league !== null ? ` · league ${r.league.toFixed(1)}` : ''}</span>
          </li>
        );
      })}
    </ul>
  );
}
