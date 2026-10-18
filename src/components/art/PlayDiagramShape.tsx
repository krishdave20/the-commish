/** The clipboard's lines on a 56 x 64 grid, shared by `PlayDiagram` and the under-the-hood page. */
export function PlayDiagramShape() {
  return (
    <>
      <rect x="6" y="8" width="44" height="52" rx="4" />
      <rect x="19" y="3" width="18" height="10" rx="2.5" />
      <path d="M14 22L18.4 26.4M18.4 22L14 26.4M26 22L30.4 26.4M30.4 22L26 26.4M38 22L42.4 26.4M42.4 22L38 26.4" />
      <circle cx="15" cy="47" r="2.4" />
      <circle cx="28" cy="49" r="2.4" />
      <circle cx="41" cy="47" r="2.4" />
      <path d="M15 44.4C15 39 18 36 23 34.4M19.9 37.7L23 34.4L18.5 33.5" />
      <path className="art-green" d="M41 44.4V37L33 31.5M37.5 32L33 31.5L35 35.6" />
      <path d="M28 46.4V38.4" strokeDasharray="1 3.4" />
    </>
  );
}
