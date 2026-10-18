/* Playoff odds remembered from the first look at each week, so Tuesday's recap can say "66% → 74%". Plain data in, plain data out;
   the app keeps it in localStorage per league. */
export interface OddsSnapshots { weeks: Record<string, number> }

export const SNAPSHOT_KEEP = 8;

export const emptySnapshots = (): OddsSnapshots => ({ weeks: {} });

/** Parse what storage holds; anything odd is an empty record. */
export function parseSnapshots(raw: string | null): OddsSnapshots {
  try {
    const v = raw ? (JSON.parse(raw) as { weeks?: unknown }) : null;
    if (!v || typeof v.weeks !== 'object' || !v.weeks) return emptySnapshots();
    const weeks: Record<string, number> = {};
    for (const [k, x] of Object.entries(v.weeks as Record<string, unknown>)) if (/^\d+$/.test(k) && typeof x === 'number' && x >= 0 && x <= 1) weeks[k] = x;
    return { weeks };
  } catch {
    return emptySnapshots();
  }
}

/** Record the odds the first time a week is seen (later looks keep the first figure). Returns the same object when nothing changes. */
export function recordFirstLook(s: OddsSnapshots, week: number, playoffPct: number): OddsSnapshots {
  if (!Number.isFinite(playoffPct) || s.weeks[String(week)] !== undefined) return s;
  const weeks = { ...s.weeks, [String(week)]: playoffPct };
  const keep = Object.keys(weeks).map(Number).sort((a, b) => b - a).slice(0, SNAPSHOT_KEEP);
  return { weeks: Object.fromEntries(keep.map((w) => [String(w), weeks[String(w)]!])) };
}

export const oddsAtStartOf = (s: OddsSnapshots, week: number): number | null => s.weeks[String(week)] ?? null;
