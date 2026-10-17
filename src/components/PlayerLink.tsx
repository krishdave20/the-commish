import { Link } from 'react-router-dom';

interface Props {
  pid: string;
  name: string;
  className?: string;
  'aria-label'?: string;
}

/** A player's name as a link to his scouting report. */
export function PlayerLink({ pid, name, className = 'pname', 'aria-label': label }: Props) {
  return <Link to={`/players/${encodeURIComponent(pid)}`} className={`${className} plink`} aria-label={label}>{name}</Link>;
}
