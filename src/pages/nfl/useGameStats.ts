import { useEffect, useState } from 'react';
import { useData } from '../../app/dataContext';
import { useLive } from '../../app/live/liveContext';
import type { WeekStats } from '../../data';
import type { NfGame } from '../../engine/nfl';

/** One week's stat lines for the game drawer. This week they are read again (a 30 s cached read) each time the live poller brings new data
    while the game is on, so the box score moves with the game; a finished week is read once. `season` is the NFL season ("2026"). */
export function useGameStats(season: string, game: NfGame, week: number, currentWeek: number): { stats: WeekStats | null; loading: boolean } {
  const { sleeper } = useData();
  const live = useLive();
  const isCurrent = week === currentWeek;
  const stamp = isCurrent && !live.replay && game.state === 'live' ? live.snapshot?.at ?? 0 : 0;
  const key = `${season}|${week}`;
  const [got, setGot] = useState<{ key: string; data: WeekStats } | null>(null);
  useEffect(() => {
    if (!sleeper || !season || game.state === 'pre') return;
    const read = isCurrent && typeof sleeper.liveStats === 'function' ? sleeper.liveStats : sleeper.stats;
    if (typeof read !== 'function') return;
    let alive = true;
    void read(season, week).then((r) => { if (alive) setGot({ key, data: r.data }); }, () => { if (alive) setGot({ key, data: {} }); });
    return () => { alive = false; };
  }, [sleeper, season, week, isCurrent, key, stamp, game.state]);
  const stats = got && got.key === key ? got.data : null;
  return { stats, loading: game.state !== 'pre' && stats === null };
}
