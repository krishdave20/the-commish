import { cityOf, nicknameOf } from '../../engine/nfl';

/** "KC kansas city chiefs": the letters, the city and (on wide screens) the nickname. Text only: no logo, no team colour. */
export function TeamCell({ abbr }: { abbr: string }) {
  return (
    <>
      <span className="nf-abbr">{abbr}</span>{' '}
      <span className="nf-city">{cityOf(abbr)} <span className="nf-nick">{nicknameOf(abbr)}</span></span>
    </>
  );
}
