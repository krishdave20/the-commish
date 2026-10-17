import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMock } from '../../engine';
import type { Mock, MockState, PickSlot, Rankings } from '../../engine';
import { logBeforeLastUserPick, readSavedMock, replayLog, writeSavedMock } from './mockSession';
import type { LogEntry, MockSetup, SavedMock } from './mockSession';
import type { OrderPlan } from './model';

interface Args {
  leagueId: string;
  rankings: Rankings;
  plan: OrderPlan;
  /** the slot to start at (my real slot) */
  defaultSlot: number;
}

interface Session {
  slot: number;
  seed: number;
  userRosterId: number;
  mock: Mock;
  log: LogEntry[];
  /** only sessions the user has touched are worth saving */
  touched: boolean;
}

export interface MockDraft {
  slot: number;
  seed: number;
  userRosterId: number;
  state: MockState;
  mock: Mock;
  /** the saved mock was for another mode (null otherwise) */
  elsewhere: SavedMock | null;
  busy: boolean;
  canUndo: boolean;
  pick: (pid: string) => void;
  simToMe: () => Promise<void>;
  simRest: () => Promise<void>;
  undo: () => void;
  restart: () => void;
  reroll: () => void;
  setSlot: (slot: number) => void;
}

const freshSeed = () => 1 + Math.floor(Math.random() * 999_999);

/** The seed of a mock nobody has touched yet, so flipping between tabs does not reroll it. */
const untouchedSeed = new Map<string, number>();

const rosterAtSlot = (order: readonly PickSlot[], slot: number): number => order.find((o) => o.slot === slot)?.originalRosterId ?? slot;

function build(setup: Omit<MockSetup, 'userRosterId'> & { slot: number }, log: readonly LogEntry[]): Session {
  const userRosterId = rosterAtSlot(setup.order, setup.slot);
  const full: MockSetup = { rankings: setup.rankings, order: setup.order, userRosterId, seed: setup.seed };
  const mock = log.length ? replayLog(full, log) : createMock(full);
  return { slot: setup.slot, seed: setup.seed, userRosterId, mock, log: log.slice(), touched: log.length > 0 };
}

/** Start from the saved mock when it fits this mode and draft, else from a fresh seed at my slot. */
function init(a: Args): { session: Session; elsewhere: SavedMock | null } {
  const { rankings, plan } = a;
  const saved = readSavedMock(a.leagueId);
  const fits = !!saved && saved.mode === rankings.mode && saved.teams === plan.teams && saved.rounds === plan.rounds && saved.slot >= 1 && saved.slot <= plan.teams;
  if (saved && fits) {
    try { return { session: build({ rankings, order: plan.order, seed: saved.seed, slot: saved.slot }, saved.log), elsewhere: null }; } catch { /* a saved mock that no longer replays is dropped */ }
  }
  const slot = Math.min(Math.max(1, a.defaultSlot), plan.teams);
  const key = `${a.leagueId}:${rankings.mode}:${plan.teams}:${plan.rounds}`;
  const seed = untouchedSeed.get(key) ?? freshSeed();
  untouchedSeed.set(key, seed);
  return { session: build({ rankings, order: plan.order, seed, slot }, []), elsewhere: saved && saved.mode !== rankings.mode && saved.log.length ? saved : null };
}

/** The mock draft's state machine for the page: one session (seed, slot, pick log) kept in step with localStorage. */
export function useMockDraft(a: Args): MockDraft {
  const [first] = useState(() => init(a));
  const [session, setSession] = useState<Session>(first.session);
  const [elsewhere, setElsewhere] = useState<SavedMock | null>(first.elsewhere);
  const [busy, setBusy] = useState(false);
  const ref = useRef(session);
  const alive = useRef(true);
  const argsRef = useRef(a);
  useEffect(() => { argsRef.current = a; });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const commit = useCallback((next: Session) => {
    ref.current = next;
    setSession(next);
    if (next.touched) {
      const { rankings, plan, leagueId } = argsRef.current;
      writeSavedMock(leagueId, { v: 1, mode: rankings.mode, slot: next.slot, seed: next.seed, teams: plan.teams, rounds: plan.rounds, log: next.log, at: Date.now() });
    }
  }, []);

  const restartWith = useCallback((over: { slot?: number; seed?: number }) => {
    const { rankings, plan } = argsRef.current;
    const cur = ref.current;
    commit({ ...build({ rankings, order: plan.order, seed: over.seed ?? cur.seed, slot: over.slot ?? cur.slot }, []), touched: true });
    setElsewhere(null);
    untouchedSeed.delete(`${argsRef.current.leagueId}:${rankings.mode}:${plan.teams}:${plan.rounds}`);
  }, [commit]);

  const pick = useCallback((pid: string) => {
    const cur = ref.current;
    if (busy) return;
    try { cur.mock.pick(pid); } catch { return; }
    commit({ ...cur, log: [...cur.log, [pid, 1]], touched: true });
    setElsewhere(null);
  }, [busy, commit]);

  /** Bots pick in slices of about 12 ms, yielding to the browser between slices, so a full 180-pick sim never freezes the page. */
  const run = useCallback(async (until: 'me' | 'end') => {
    if (busy) return;
    const start = ref.current;
    const { order } = argsRef.current.plan;
    setBusy(true);
    setElsewhere(null);
    let sess = start;
    try {
      for (;;) {
        const t0 = performance.now();
        const log = sess.log.slice();
        while (log.length < order.length && !(until === 'me' && order[log.length]!.rosterId === sess.userRosterId) && performance.now() - t0 < 12) {
          log.push([start.mock.autoPick().pid, 0]);
        }
        sess = { ...sess, log, touched: true };
        if (ref.current.mock !== start.mock || !alive.current) return;
        commit(sess);
        const done = log.length >= order.length || (until === 'me' && order[log.length]!.rosterId === sess.userRosterId);
        if (done) return;
        await new Promise<void>((r) => { setTimeout(r, 0); });
        if (ref.current.mock !== start.mock || !alive.current) return;
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, commit]);

  const undo = useCallback(() => {
    if (busy) return;
    const cur = ref.current;
    const { rankings, plan } = argsRef.current;
    const keep = logBeforeLastUserPick(cur.log, plan.order, cur.userRosterId);
    if (!keep) return;
    commit({ ...build({ rankings, order: plan.order, seed: cur.seed, slot: cur.slot }, keep), touched: true });
  }, [busy, commit]);

  const state = useMemo(() => session.mock.state, [session]);
  const canUndo = useMemo(() => logBeforeLastUserPick(session.log, a.plan.order, session.userRosterId) !== null, [session, a.plan.order]);

  return {
    slot: session.slot, seed: session.seed, userRosterId: session.userRosterId, state, mock: session.mock, elsewhere, busy, canUndo,
    pick,
    simToMe: () => run('me'),
    simRest: () => run('end'),
    undo,
    restart: () => { if (!busy) restartWith({}); },
    reroll: () => { if (!busy) restartWith({ seed: freshSeed() }); },
    setSlot: (slot) => { if (!busy) restartWith({ slot }); },
  };
}
