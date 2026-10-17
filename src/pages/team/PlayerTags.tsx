import type { ModelPlayer } from '../../engine';

/** Injury and IR pills beside a player's name. */
export function PlayerTags({ p, added }: { p: ModelPlayer; added?: boolean }) {
  return (
    <>
      {p.onIr ? <> <span className="pill mute">ir</span></> : p.injury ? <> <span className="pill warn">{p.injury}</span></> : null}
      {added && <> <span className="pill ok">added</span></>}
    </>
  );
}
