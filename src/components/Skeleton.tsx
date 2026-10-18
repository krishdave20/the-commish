interface CardsProps {
  /** how many placeholder cards */
  cards?: number;
}

/** Quiet, still placeholder cards that hold a page's space while its data loads, so the content lands without a jump.
    Decorative: the page says what it is waiting for in a status line next to it. */
export function PageSkeleton({ cards = 3 }: CardsProps) {
  return (
    <div className="skel-stack" aria-hidden="true" data-skeleton="page">
      {Array.from({ length: cards }, (_, i) => (
        <div className="card skel-card" key={i}>
          <span className="skel h2" />
          <span className="skel line" />
          <span className="skel line short" />
        </div>
      ))}
    </div>
  );
}

interface BlockProps {
  /** CSS height that matches the finished panel, e.g. "21rem" */
  height: string;
}

/** One still block for a chart or table that is still being worked out, sized like the finished thing. */
export function BlockSkeleton({ height }: BlockProps) {
  return <span className="skel block" style={{ height }} aria-hidden="true" data-skeleton="block" />;
}
