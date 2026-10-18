import { Disclosure } from '../../components/Disclosure';

export function AttributionSection() {
  return (
    <Disclosure title="Attribution" id="set-attr">
      <ul className="plain">
        <li>Play-by-play and snap data: nflverse. Charting data: FTN Data via nflverse.</li>
        <li>Values: FantasyCalc.</li>
        <li>League data: Sleeper public API.</li>
      </ul>
    </Disclosure>
  );
}
