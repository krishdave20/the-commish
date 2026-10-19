import type { ReactNode } from 'react';

/** The pieces of a tap-to-expand row on a phone (the state is in expandState.ts). */

/** The last cell of a row: a 44 px chevron that opens and closes the detail row under it. */
export function ExpandCell({ open, controls, label, onToggle }: { open: boolean; controls: string; label: string; onToggle: () => void }) {
  return (
    <td className="xc">
      <button
        type="button" className="xbtn" aria-expanded={open} aria-controls={open ? controls : undefined} aria-label={label}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      >
        <i aria-hidden="true" />
      </button>
    </td>
  );
}

export interface DetailItem { label: string; value: ReactNode }

/** The row under an open row: the columns the phone left out, as label and value pairs, and an optional action. */
export function DetailRow({ id, colSpan, items, children }: { id: string; colSpan: number; items: DetailItem[]; children?: ReactNode }) {
  return (
    <tr className="xrow" id={id}>
      <td colSpan={colSpan}>
        <dl className="xdl">
          {items.map((it) => <div key={it.label}><dt>{it.label}</dt><dd>{it.value}</dd></div>)}
        </dl>
        {children}
      </td>
    </tr>
  );
}
