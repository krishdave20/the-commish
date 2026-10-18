import { ordinalPick } from './model';

interface Props {
  pickNo: number;
  round: number;
  slot: number;
  replay: boolean;
}

/** "you're on the clock": prominent, quiet (no sound, no flashing). */
export function ClockBanner({ pickNo, round, slot, replay }: Props) {
  return (
    <section className="banner otc-banner" aria-labelledby="otc-title" role={replay ? undefined : 'status'}>
      <div className="micro">{replay ? 'replay · this is not live' : 'the draft is waiting on you'}</div>
      <h2 id="otc-title">you’re on the clock</h2>
      <p>pick {pickNo} · round {round}, slot {slot} ({ordinalPick(round, slot)})</p>
    </section>
  );
}
