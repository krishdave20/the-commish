import { CommissionersOffice, FieldStrip, Football, Goalposts, Helmet, Megaphone, PlayDiagram, StadiumLights, Trophy, Whistle } from './index';
import type { ArtProps } from './Art';
import type { ComponentType } from 'react';

const PIECES: Array<[string, ComponentType<ArtProps>, number]> = [
  ['Football', Football, 40], ['Goalposts', Goalposts, 36], ['FieldStrip', FieldStrip, 160], ['PlayDiagram', PlayDiagram, 48],
  ['Whistle', Whistle, 40], ['Trophy', Trophy, 36], ['Megaphone', Megaphone, 44], ['StadiumLights', StadiumLights, 48],
  ['Helmet', Helmet, 44], ['CommissionersOffice', CommissionersOffice, 144],
];

/** Every illustration at its working size and at 2.5 times that, for tuning the set. Dev only: reached through /art-gallery.html, not routed in the app. */
export function ArtGallery() {
  return (
    <main className="page" style={{ padding: 'var(--s-4)' }}>
      <h1>art gallery</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: 'var(--s-4)' }}>
        {PIECES.map(([name, Piece, size]) => (
          <figure key={name} style={{ margin: 0, display: 'grid', gap: 'var(--s-2)', alignContent: 'start' }}>
            <figcaption className="micro">{name}</figcaption>
            <div style={{ display: 'flex', gap: 'var(--s-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Piece size={size} title={name} />
              <Piece size={size * 2.5} />
            </div>
          </figure>
        ))}
      </div>
    </main>
  );
}
