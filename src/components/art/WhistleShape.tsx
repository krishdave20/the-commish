/** The whistle's lines on a 48 x 32 grid, shared by `Whistle` and the office scene. */
export function WhistleShape() {
  return (
    <>
      <circle cx="33" cy="19" r="9.5" />
      <path d="M3 12.5H26.1M6.5 20.5H23.6M3 12.5L6.5 20.5" />
      <path d="M27 13.6L31.6 10.2" />
      <circle cx="34" cy="20.5" r="2" />
      <circle cx="38" cy="6.6" r="3" />
      <path className="art-gold" d="M41 5.4C44 3 46.5 6 45.6 10.5" />
    </>
  );
}
