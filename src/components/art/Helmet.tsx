import { Art } from './Art';
import type { ArtProps } from './Art';

/** A plain helmet in profile, facing right. A stripe and a facemask; no logo. */
export function Helmet(props: ArtProps) {
  return (
    <Art w={52} h={44} defaultSize={44} {...props}>
      <path d="M9 31C3.6 22 6 11.5 15 7.6C24 3.6 36 5.6 41.6 13.4C43.6 16.4 44.6 20 44.6 25H36V30.5C36 34 33.6 36.5 30 36.5H21C15.5 36.5 11.4 34.6 9 31Z" />
      <circle cx="22.5" cy="24.5" r="3" />
      <path className="art-green" d="M15.5 11.5C24 7.6 33 9.4 38.4 15.6" />
      <path d="M44.6 25C48 25.5 49 31 46.6 34.6C44.4 37.8 40 38.6 35 36.6M47.4 29.4H38M45.8 33.6H36.6" />
    </Art>
  );
}
