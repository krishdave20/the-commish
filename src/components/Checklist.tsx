export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

interface Props {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  /** accessible name for the list */
  label: string;
}

/** Checkbox tasks; done items get a line-through. Used by the pre-draft Home later. */
export function Checklist({ items, onToggle, label }: Props) {
  return (
    <ul className="checks" aria-label={label}>
      {items.map((it) => (
        <li key={it.id}>
          <label>
            <input type="checkbox" checked={it.done} onChange={() => onToggle(it.id)} />
            <span>{it.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
