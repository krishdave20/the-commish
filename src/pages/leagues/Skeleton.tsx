/** Still placeholders that hold a card's space while its league loads. */
export function Skeleton() {
  return (
    <div className="lg-skel" aria-hidden="true">
      <span className="skel h2" />
      <span className="skel line" />
      <span className="skel line short" />
    </div>
  );
}
