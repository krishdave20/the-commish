/* The pick feed behind the live assistant and its replay.

   A PickSource answers "what are the picks so far?". The live source asks Sleeper; the replay source hands out a saved
   draft one pick per call. Both go through the same poller (usePickFeed) and the same reducer (feedReducer), and the
   panels read the same liveSnapshot from the result, so a replay exercises exactly the code a live draft does. */
import type { DraftPick, DraftStatus, SleeperClient } from '../../data';

export interface PollResult {
  /** every pick made so far (not just new ones) */
  picks: DraftPick[];
  /** the draft's status when the source knows it */
  status?: DraftStatus;
  /** true once the draft has all its picks; the poller stops */
  complete?: boolean;
}

export interface PickSource {
  kind: 'live' | 'replay';
  poll(): Promise<PollResult>;
}

/** Poll interval for a live draft (the spec asks for 3 to 5 seconds). */
export const LIVE_INTERVAL_MS = 4000;
export const MAX_BACKOFF_MS = 30_000;

/** Replay speeds: 0 is manual stepping, otherwise picks per second. */
export const REPLAY_SPEEDS = [
  { value: 0, label: 'step', ms: 0 },
  { value: 1, label: '1 pick/s', ms: 1000 },
  { value: 4, label: '4 picks/s', ms: 250 },
  { value: 10, label: '10 picks/s', ms: 100 },
] as const;

/** The wait before the next poll: the base interval, then doubling after each failure (8 s, 16 s) up to 30 s. */
export function nextDelay(baseMs: number, failures: number): number {
  return failures <= 0 ? baseMs : Math.min(MAX_BACKOFF_MS, baseMs * 2 ** failures);
}

/* ---------- sources ---------- */

type DraftReader = Pick<SleeperClient, 'draftPicks' | 'draft'>;

/** Sleeper's picks (and the draft's status), always from the network. */
export function liveSource(sleeper: DraftReader, draftId: string, totalPicks: number): PickSource {
  return {
    kind: 'live',
    async poll() {
      const [picks, draft] = await Promise.all([
        sleeper.draftPicks(draftId, { force: true }),
        // the status is a nice-to-have: a failed read must not fail the poll
        Promise.resolve().then(() => sleeper.draft(draftId, { force: true })).then((d) => d.data.status, () => undefined),
      ]);
      const list = picks.data;
      const complete = draft === 'complete' || (totalPicks > 0 && list.length >= totalPicks);
      return { picks: list, status: complete ? 'complete' : draft, complete };
    },
  };
}

export interface ReplaySource extends PickSource {
  kind: 'replay';
  /** picks revealed so far */
  readonly cursor: number;
  readonly total: number;
}

/** A finished draft handed out one pick per poll(). */
export function replaySource(all: readonly DraftPick[]): ReplaySource {
  const sorted = all.slice().sort((a, b) => a.pick_no - b.pick_no);
  let cursor = 0;
  return {
    kind: 'replay',
    get cursor() { return cursor; },
    get total() { return sorted.length; },
    poll() {
      cursor = Math.min(sorted.length, cursor + 1);
      const done = cursor >= sorted.length;
      return Promise.resolve({ picks: sorted.slice(0, cursor), status: done ? 'complete' : 'drafting', complete: done });
    },
  };
}

/* ---------- state ---------- */

export interface FeedState {
  picks: DraftPick[];
  /** epoch ms of the last poll that worked */
  lastUpdate: number | null;
  /** polls in a row that failed */
  failures: number;
  error: string | null;
  complete: boolean;
  status: DraftStatus | null;
  /** polls that worked */
  polls: number;
}

export const INITIAL_FEED: FeedState = { picks: [], lastUpdate: null, failures: 0, error: null, complete: false, status: null, polls: 0 };

export type FeedAction =
  | { type: 'polled'; result: PollResult; at: number }
  | { type: 'failed'; message: string }
  | { type: 'reset' };

const sameIds = (a: readonly DraftPick[], b: readonly DraftPick[]) =>
  a.length === b.length && a.every((p, i) => p.pick_no === b[i]!.pick_no && p.player_id === b[i]!.player_id && p.roster_id === b[i]!.roster_id);

/** Picks sorted by number, one per number (the last one wins). */
export function normalizePicks(picks: readonly DraftPick[]): DraftPick[] {
  const byNo = new Map<number, DraftPick>();
  for (const p of picks) byNo.set(p.pick_no, p);
  return [...byNo.values()].sort((a, b) => a.pick_no - b.pick_no);
}

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case 'reset': return INITIAL_FEED;
    case 'failed': return { ...state, failures: state.failures + 1, error: action.message };
    case 'polled': {
      const next = normalizePicks(action.result.picks);
      return {
        // the same array when nothing changed, so memoised panels do not recompute
        picks: sameIds(state.picks, next) ? state.picks : next,
        lastUpdate: action.at, failures: 0, error: null,
        complete: action.result.complete ?? state.complete,
        status: action.result.status ?? state.status,
        polls: state.polls + 1,
      };
    }
  }
}
