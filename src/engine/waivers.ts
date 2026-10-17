/* Waiver board (port of waiverBoard in reference/ff_live.js).

   For each free agent: add him, drop one of the 5 cheapest droppable players (cost = lineup points lost
   over the window by dropping that player), and measure the lift in the best lineup summed over the window.
   The best of the 5 drops is that player's gain; a gain of 0.3 points or less is not listed.
   FAAB bid = faabLeft × min(25%, gain / scale + hot) where scale is 250 (rest of season), 90 (playoff weeks)
   or 40 (next week), and "hot" adds 3% when the player has over 500,000 adds in 72 hours. */
import { createScope, emptyScenario, type Scenario } from './scenario.ts';
import type { Model, ModelPlayer } from './types.ts';

export type WaiverWindow = 'reg' | 'next' | 'po';
export const WAIVER_WINDOWS: ReadonlyArray<{ id: WaiverWindow; label: string }> = [
  { id: 'reg', label: 'Rest of season' },
  { id: 'next', label: 'Next week' },
  { id: 'po', label: 'Playoff weeks' },
];

export const WAIVER_GAIN_MIN = 0.3;
export const WAIVER_DROP_CANDIDATES = 5;
export const WAIVER_SCALE: Record<WaiverWindow, number> = { reg: 250, po: 90, next: 40 };
export const WAIVER_BID_CAP = 0.25;
export const WAIVER_HOT_ADDS = 500000;
export const WAIVER_HOT_BUMP = 0.03;

export interface WaiverEntry {
  pid: string;
  player: ModelPlayer;
  /** extra lineup points over the window */
  gain: number;
  /** weeks in the window where he is in the best lineup */
  starts: number;
  /** weeks in the window */
  nweeks: number;
  /** the player to drop */
  drop: ModelPlayer;
  /** suggested FAAB bid in dollars */
  bid: number;
  /** his value next week (with what-if overrides) */
  next: number;
  /** his ceiling next week */
  ceil: number;
  /** adds over the last 72 hours */
  trend: number;
}

export interface WaiverBoard {
  window: WaiverWindow;
  weeks: number[];
  /** best first */
  list: WaiverEntry[];
}

export function waiverWeeks(model: Model, win: WaiverWindow): number[] {
  const { currentWeek: cur, lastRegularWeek: last, maxWeek } = model.meta;
  if (win === 'po') return model.meta.playoffWeeks.length ? model.meta.playoffWeeks : [last + 1];
  if (win === 'next') return [cur + 1];
  const out: number[] = [];
  for (let w = cur; w <= maxWeek; w++) if (w <= last) out.push(w);
  return out;
}

export function bidFor(faabLeft: number, gain: number, win: WaiverWindow, adds72h = 0): number {
  const hot = adds72h > WAIVER_HOT_ADDS ? WAIVER_HOT_BUMP : 0;
  return Math.round(faabLeft * Math.min(WAIVER_BID_CAP, gain / WAIVER_SCALE[win] + hot));
}

export function waiverBoard(model: Model, scenario: Scenario = emptyScenario(), win: WaiverWindow = 'reg', meRid: number = model.meRid): WaiverBoard {
  const sc = createScope(model, scenario, meRid);
  const cur = model.meta.currentWeek;
  const ros = sc.myRoster();
  const weeks = waiverWeeks(model, win);
  const baseW: Record<number, number> = {};
  weeks.forEach((w) => { baseW[w] = sc.total(ros, w, true); });
  const baseSum = weeks.reduce((s, w) => s + baseW[w]!, 0);
  const droppable = ros.filter((id) => {
    const p = sc.idx.P[id];
    return p && !p.onIr && !(p.playedThisWeek && weeks.includes(cur));
  });
  const cost = droppable
    .map((id): [string, number] => {
      const rest = ros.filter((x) => x !== id);
      return [id, baseSum - weeks.reduce((s, w) => s + sc.total(rest, w, true), 0)];
    })
    .sort((a, b) => a[1] - b[1])
    .slice(0, WAIVER_DROP_CANDIDATES);
  const faab = sc.idx.byRid[meRid]?.faabLeft ?? 0;
  const adds = new Set(scenario.adds);
  const list: WaiverEntry[] = [];
  for (const p of model.players) {
    if (p.ownerRid !== 0 || adds.has(p.pid)) continue;
    let best: { gain: number; starts: number; drop: ModelPlayer } | null = null;
    for (const [d] of cost) {
      const r2 = ros.filter((x) => x !== d).concat([p.pid]);
      let g = 0, starts = 0;
      for (const w of weeks) {
        const L = sc.lineup(r2, w, true);
        g += L.total - baseW[w]!;
        if (L.slots.some((s) => s.p === p)) starts++;
      }
      if (!best || g > best.gain) best = { gain: g, starts, drop: sc.idx.P[d]! };
    }
    if (best && best.gain > WAIVER_GAIN_MIN) {
      list.push({
        pid: p.pid, player: p, gain: best.gain, starts: best.starts, drop: best.drop, nweeks: weeks.length,
        bid: bidFor(faab, best.gain, win, p.adds72h),
        next: sc.val(p, cur + 1, true), ceil: sc.range(p, cur + 1, true)[1], trend: p.adds72h || 0,
      });
    }
  }
  list.sort((a, b) => b.gain - a.gain);
  return { window: win, weeks, list };
}

/** All three windows at once (the UI's window switcher), each with its starts per player. */
export function waiverBoards(model: Model, scenario: Scenario = emptyScenario(), meRid: number = model.meRid): Record<WaiverWindow, WaiverBoard> {
  return { reg: waiverBoard(model, scenario, 'reg', meRid), next: waiverBoard(model, scenario, 'next', meRid), po: waiverBoard(model, scenario, 'po', meRid) };
}
