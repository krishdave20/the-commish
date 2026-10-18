import type { ReactNode } from 'react';
import { minimumFor } from './nflverseSelect';
import type { Gate } from './nflverseSelect';
import { formatCount } from '../../app/format';

export interface SplitRow {
  key: string;
  label: string;
  /** formatted value, or null when the split is not available */
  value: string | null;
  /** the sample behind it, shown for every split */
  sample: number | null;
  /** what the sample counts: "targets", "carries", "routes" */
  unit: string;
  /** the minimum applied to this split */
  gate?: Gate;
  /** a plain-English definition for the tooltip */
  hint?: string;
  /** an honest label such as "proxy" */
  tag?: string;
  /** shown when `value` is null for a reason other than the sample minimum */
  missing?: string;
  /** extra text beside the value */
  note?: ReactNode;
}

/** Stat, value and sample size. A split under its minimum shows "—" and why; every split shows its sample. */
export function SplitTable({ rows, caption }: { rows: SplitRow[]; caption: string }) {
  return (
    <div className="tw">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr><th scope="col">stat</th><th scope="col" className="n">value</th><th scope="col" className="n">sample</th><th scope="col" className="hide-sm">note</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const under = r.value === null && r.gate && r.sample !== null && r.sample < minimumFor(r.gate);
            return (
              <tr key={r.key}>
                <td title={r.hint}>
                  {r.label}{r.tag && <> <span className="pill mute">{r.tag}</span></>}
                </td>
                <td className="n pname">{r.value ?? '—'}</td>
                <td className="n dim">{r.sample === null ? '—' : `${formatCount(r.sample)} ${r.unit}`}</td>
                <td className="hide-sm dim">
                  {under ? `hidden: under ${minimumFor(r.gate as Gate)} ${r.unit}` : r.value === null ? (r.missing ?? 'not available') : r.note}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
