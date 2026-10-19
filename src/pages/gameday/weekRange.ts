/** The scrollLeft that puts a chip in the middle of its scroller (never past either end). Pure, so the phone behaviour can be tested without a layout engine. */
export function centerScrollLeft(box: { width: number; scrollWidth: number }, chip: { left: number; width: number }): number {
  const target = chip.left - (box.width - chip.width) / 2;
  return Math.max(0, Math.min(box.scrollWidth - box.width, target));
}

/** The weeks to pick from: 1 to the current week (the playoff weeks follow once the season gets there). */
export function weekList(currentWeek: number): number[] {
  return Array.from({ length: Math.max(0, Math.min(currentWeek, 22)) }, (_, i) => i + 1);
}
