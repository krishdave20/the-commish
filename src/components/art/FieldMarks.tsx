import { END_ZONE, FIELD_YARDS, YARD_LINES, hashPath } from './field';

/** The field's markings, drawn on a grid 120 yards wide and `h` tall: two end zones, a line every 10 yards, a stronger one at midfield and
    hash marks. Lines keep their pixel width however the field is stretched (art.css). */
export function FieldMarks({ h }: { h: number }) {
  return (
    <>
      <rect className="art-ez" data-side="left" x="0" y="0" width={END_ZONE} height={h} />
      <rect className="art-ez" data-side="right" x={FIELD_YARDS - END_ZONE} y="0" width={END_ZONE} height={h} />
      {YARD_LINES.map((yd) => (
        <path key={yd} className={yd === 50 ? 'art-yl art-mid' : 'art-yl'} d={`M${END_ZONE + yd} 0V${h}`} />
      ))}
      <path className="art-hash" d={hashPath(h)} />
    </>
  );
}
