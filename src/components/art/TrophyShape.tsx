/** The trophy's lines on a 40 x 48 grid, shared by `Trophy` and the office scene. */
export function TrophyShape() {
  return (
    <>
      <path d="M11 6H29V15C29 21 25 25.5 20 25.5C15 25.5 11 21 11 15Z" />
      <path d="M11 9H6.5C6.5 15.5 9 18 12 18M29 9H33.5C33.5 15.5 31 18 28 18" />
      <path d="M20 25.5V32M15 32H25L28 41H12Z" />
      <path className="art-gold art-thin" d="M20 10.9L20.9 13.3L23.4 13.4L21.4 15L22.1 17.4L20 16L17.9 17.4L18.6 15L16.6 13.4L19.1 13.3Z" />
    </>
  );
}
