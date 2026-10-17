import type { PickValue } from '../../engine';

/** "+12 value", "−9 reach", or "on adp" for a pick's distance from ADP (pick number − ADP). Null without an ADP. */
export function valueLabel(value: number | null): { text: string; tone: 'pos-c' | 'neg-c' | 'dim' } {
  if (value === null) return { text: 'no adp', tone: 'dim' };
  const r = Math.round(value);
  if (r > 0) return { text: `+${r} value`, tone: 'pos-c' };
  if (r < 0) return { text: `−${Math.abs(r)} reach`, tone: 'neg-c' };
  return { text: 'on adp', tone: 'dim' };
}

/** The biggest steals (largest positive value) and reaches (most negative) among picks that have an ADP. */
export function stealsAndReaches(values: readonly PickValue[], n = 3): { steals: PickValue[]; reaches: PickValue[] } {
  const withAdp = values.filter((v): v is PickValue & { value: number } => v.value !== null);
  const steals = withAdp.filter((v) => Math.round(v.value) > 0).sort((a, b) => b.value - a.value).slice(0, n);
  const reaches = withAdp.filter((v) => Math.round(v.value) < 0).sort((a, b) => a.value - b.value).slice(0, n);
  return { steals, reaches };
}
