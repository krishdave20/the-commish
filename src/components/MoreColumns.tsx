interface Props {
  on: boolean;
  onToggle: () => void;
  /** what the table is, for the accessible name: "more columns: waiver wire" */
  label?: string;
}

/** The "more columns" switch above a table. State lives in `useMoreColumns` (remembered per table). */
export function MoreColumns({ on, onToggle, label }: Props) {
  return (
    <div className="more-cols">
      <button type="button" className="btn quiet" aria-pressed={on} onClick={onToggle} aria-label={label ? `more columns: ${label}` : undefined}>
        more columns
      </button>
    </div>
  );
}
