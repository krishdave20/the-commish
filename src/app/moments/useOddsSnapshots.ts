import { useEffect, useMemo, useState } from 'react';
import { emptySnapshots, parseSnapshots, recordFirstLook } from '../../engine/moments';
import type { OddsSnapshots } from '../../engine/moments';

const key = (leagueId: string) => `wr.moments.odds.v1:${leagueId}`;

function read(leagueId: string): OddsSnapshots {
  try { return parseSnapshots(window.localStorage.getItem(key(leagueId))); } catch { return emptySnapshots(); }
}

/** The playoff odds seen the first time each week was opened, kept per league on this device. Records the figure when `playoffPct` is known
    and `record` is on (it is off under a preview clock, so a preview never writes). */
export function useOddsSnapshots(leagueId: string | null, week: number | null, playoffPct: number | null, record: boolean): OddsSnapshots {
  const [stored, setStored] = useState<{ leagueId: string | null; value: OddsSnapshots }>(() => ({ leagueId, value: leagueId ? read(leagueId) : emptySnapshots() }));
  let base = stored.value;
  if (stored.leagueId !== leagueId) { base = leagueId ? read(leagueId) : emptySnapshots(); setStored({ leagueId, value: base }); }
  // the first look at a week is part of the answer straight away; the effect only saves it
  const value = useMemo(
    () => (record && week !== null && playoffPct !== null ? recordFirstLook(base, week, playoffPct) : base),
    [base, record, week, playoffPct],
  );
  useEffect(() => {
    if (value === base || !leagueId) return;
    try { window.localStorage.setItem(key(leagueId), JSON.stringify(value)); } catch { /* storage blocked: kept until the page closes */ }
  }, [value, base, leagueId]);
  return value;
}
