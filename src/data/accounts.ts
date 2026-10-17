/* Linked Sleeper accounts on this device. localStorage under `wr.accounts.v1`; if storage is blocked
   or throws, the same API keeps working from memory for the session. list()/active() return stable
   references until something changes, so React's useSyncExternalStore can read them directly. */
import type { AccountStore, LinkedAccount } from './contract.ts';

export const ACCOUNTS_KEY = 'wr.accounts.v1';

interface State { accounts: LinkedAccount[]; activeUserId: string | null }

const isAccount = (x: unknown): x is LinkedAccount => {
  const a = x as LinkedAccount | null;
  return !!a && typeof a === 'object' && typeof a.userId === 'string' && typeof a.username === 'string' && Array.isArray(a.leagueIds);
};

function parse(raw: string | null): State | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.accounts)) return null;
    return { accounts: j.accounts.filter(isAccount), activeUserId: typeof j.activeUserId === 'string' ? j.activeUserId : null };
  } catch { return null; }
}

function defaultStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function createAccountStore(storage: Storage | undefined = defaultStorage()): AccountStore {
  const subs = new Set<() => void>();
  let state: State = { accounts: [], activeUserId: null };
  let lastRaw: string | null = null;

  /* re-read storage each time (another tab may have written), but keep the same object while the raw text is unchanged */
  const read = (): State => {
    let raw: string | null;
    try { raw = storage ? storage.getItem(ACCOUNTS_KEY) : null; } catch { return state; }
    if (storage && raw !== lastRaw) {
      lastRaw = raw;
      const p = parse(raw);
      if (p) state = p;
      else if (raw === null) state = state.accounts.length ? state : { accounts: [], activeUserId: null };
    }
    return state;
  };

  const write = (next: State) => {
    state = next;
    try {
      if (storage) {
        const raw = JSON.stringify(next);
        storage.setItem(ACCOUNTS_KEY, raw);
        lastRaw = raw;
      }
    } catch { /* blocked: keep going from memory */ }
    subs.forEach((fn) => { try { fn(); } catch { /* a bad subscriber must not block the others */ } });
  };

  const update = (fn: (s: State) => State) => write(fn(read()));
  const patch = (userId: string, fn: (a: LinkedAccount) => LinkedAccount) =>
    update((s) => ({ ...s, accounts: s.accounts.map((a) => (a.userId === userId ? fn(a) : a)) }));

  return {
    list: () => read().accounts,
    active() {
      const s = read();
      return s.accounts.find((a) => a.userId === s.activeUserId) ?? null;
    },
    upsert(acc) {
      update((s) => {
        const has = s.accounts.some((a) => a.userId === acc.userId);
        return {
          accounts: has ? s.accounts.map((a) => (a.userId === acc.userId ? acc : a)) : [...s.accounts, acc],
          activeUserId: s.activeUserId && s.accounts.some((a) => a.userId === s.activeUserId) ? s.activeUserId : acc.userId,
        };
      });
    },
    setActive(userId) {
      update((s) => (s.accounts.some((a) => a.userId === userId) ? { ...s, activeUserId: userId } : s));
    },
    setActiveLeague(userId, leagueId) {
      patch(userId, (a) => ({ ...a, activeLeagueId: leagueId, leagueIds: a.leagueIds.includes(leagueId) ? a.leagueIds : [...a.leagueIds, leagueId] }));
    },
    remove(userId) {
      update((s) => {
        const accounts = s.accounts.filter((a) => a.userId !== userId);
        return { accounts, activeUserId: s.activeUserId === userId ? (accounts[0]?.userId ?? null) : s.activeUserId };
      });
    },
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
}
