import { Art } from './Art';
import type { ArtProps } from './Art';
import { TrophyShape } from './TrophyShape';
import { WhistleShape } from './WhistleShape';

/** The commissioner's desk: a lamp, a clipboard, a trophy and a whistle on top, a plain pennant on the wall. Drawn in the same hand as the rest of the set. */
export function CommissionersOffice(props: ArtProps) {
  return (
    <Art w={160} h={104} defaultSize={144} {...props}>
      {/* the wall: a pennant on a stick, with no marks on it */}
      <path d="M100 6V32" />
      <path d="M100 11L148 19.5L100 28Z" />
      <path className="art-green" d="M106 19.5H132" />
      {/* the desk */}
      <path d="M6 68H154V74H6Z" />
      <path d="M18 74V100H56V74M18 87H56M32 80.5H42M32 93.5H42M142 74V100M134 74V100" />
      <path className="art-floor" d="M2 100.5H158" />
      {/* lamp */}
      <path d="M13 68C13 63.5 31 63.5 31 68" />
      <path d="M22 65L27 46L42 38" />
      <path d="M40 35L45.5 30.5L61 39.5L47.5 46Z" />
      <path className="art-gold" d="M50 50.5L49 62M55.5 48L57 61M60.5 45L66 56.5" strokeDasharray="2.4 3.4" />
      {/* clipboard */}
      <rect x="72" y="38" width="22" height="30" rx="2.5" />
      <rect x="79" y="34.5" width="8" height="6" rx="1.8" />
      <path d="M77 47.5L80.6 51.1M80.6 47.5L77 51.1M86.5 47.5L90.1 51.1M90.1 47.5L86.5 51.1" />
      <circle cx="78.8" cy="60.5" r="2" />
      <circle cx="88.6" cy="60.5" r="2" />
      <path className="art-green" d="M88.6 57.5V54.5L83 54.5" />
      {/* trophy */}
      <g transform="translate(102 37.5) scale(0.64)"><TrophyShape /></g>
      {/* whistle, lying on the desk */}
      <g transform="translate(128 54.5) scale(0.5)"><WhistleShape /></g>
    </Art>
  );
}
