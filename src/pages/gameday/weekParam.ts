/** Which week game day shows, from `?week=`. A number from 1 to the current week; "now" and "last" (the old switch) still work. With no
    `week`, an off-day opens on last week's finals and any other day on this week. A week past the current one clamps to it. */
export function resolveWeek(raw: string | null, currentWeek: number, offDay: boolean): number {
  const last = currentWeek - 1;
  if (raw === 'now') return currentWeek;
  if (raw === 'last') return last >= 1 ? last : currentWeek;
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  if (Number.isInteger(n) && n >= 1) return Math.min(n, currentWeek);
  return offDay && last >= 1 ? last : currentWeek;
}
