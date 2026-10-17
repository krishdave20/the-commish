import { formatCount } from '../../app/format';
import type { PickValuation } from '../../engine/dynasty/index.ts';
import type { DynastyView } from './useDynasty';

/** Future picks to tick into a deal, shaped like the player lists: "2027 1st (via arnavn23) · mid · 3,420". */
export function PickPicker({ title, picks, checked, onToggle, dyn }: {
  title: string;
  picks: PickValuation[];
  checked: string[];
  onToggle: (key: string) => void;
  dyn: DynastyView;
}) {
  const sorted = [...picks].sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round || a.originalRosterId - b.originalRosterId);
  return (
    <div className="stack">
      <h3>{title}</h3>
      <div className="picklist" role="group" aria-label={title}>
        {sorted.length === 0 && <p className="note" style={{ padding: '6px 9px', margin: 0 }}>no future picks.</p>}
        {sorted.map((p) => (
          <label key={p.key}>
            <input type="checkbox" checked={checked.includes(p.key)} onChange={() => onToggle(p.key)} aria-label={`${title}: ${dyn.pickName(p)}`} />
            <span>
              <span className="dim">pick </span>{dyn.pickName(p)}
              <span className="dim"> · {p.bucket}</span>
            </span>
            <span className="dim" title={p.estimated ? 'priced from the nearest fantasycalc row' : 'fantasycalc value'}>
              {p.value === null ? '—' : `${formatCount(p.value)}${p.estimated ? ' est.' : ''}`}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
