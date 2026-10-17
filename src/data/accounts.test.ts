import { describe, expect, it, vi } from 'vitest';
import { ACCOUNTS_KEY, createAccountStore } from './accounts.ts';
import type { LinkedAccount } from './contract.ts';

const acc = (id: string, over: Partial<LinkedAccount> = {}): LinkedAccount => ({
  userId: id, username: `user${id}`, displayName: `User ${id}`, avatar: null, leagueIds: [], activeLeagueId: null, addedAt: 1, ...over,
});

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, removeItem: (k) => { m.delete(k); }, setItem: (k, v) => { m.set(k, String(v)); },
  };
}
const blocked = (): Storage => {
  const boom = () => { throw new DOMException('denied', 'SecurityError'); };
  return { length: 0, clear: boom, key: boom, getItem: boom, removeItem: boom, setItem: boom };
};

describe('account store', () => {
  it('starts empty; the first account becomes active', () => {
    const s = createAccountStore(memStorage());
    expect(s.list()).toEqual([]);
    expect(s.active()).toBeNull();
    s.upsert(acc('1'));
    s.upsert(acc('2'));
    expect(s.list().map((a) => a.userId)).toEqual(['1', '2']);
    expect(s.active()?.userId).toBe('1');
  });

  it('upsert replaces by userId and keeps the active account', () => {
    const s = createAccountStore(memStorage());
    s.upsert(acc('1'));
    s.upsert(acc('2'));
    s.setActive('2');
    s.upsert(acc('1', { displayName: 'Renamed' }));
    expect(s.list()).toHaveLength(2);
    expect(s.list()[0].displayName).toBe('Renamed');
    expect(s.active()?.userId).toBe('2');
  });

  it('setActive ignores unknown users; setActiveLeague also follows the league', () => {
    const s = createAccountStore(memStorage());
    s.upsert(acc('1'));
    s.setActive('nope');
    expect(s.active()?.userId).toBe('1');
    s.setActiveLeague('1', 'L9');
    expect(s.active()).toMatchObject({ activeLeagueId: 'L9', leagueIds: ['L9'] });
    s.setActiveLeague('1', 'L9');
    expect(s.active()?.leagueIds).toEqual(['L9']);
  });

  it('remove moves active to the next account, then to null', () => {
    const s = createAccountStore(memStorage());
    s.upsert(acc('1'));
    s.upsert(acc('2'));
    s.remove('1');
    expect(s.active()?.userId).toBe('2');
    s.remove('2');
    expect(s.active()).toBeNull();
    expect(s.list()).toEqual([]);
  });

  it('persists under wr.accounts.v1 and a second store sees it', () => {
    const st = memStorage();
    createAccountStore(st).upsert(acc('1', { leagueIds: ['L1'] }));
    expect(JSON.parse(st.getItem(ACCOUNTS_KEY)!)).toMatchObject({ activeUserId: '1' });
    const again = createAccountStore(st);
    expect(again.active()?.leagueIds).toEqual(['L1']);
  });

  it('returns the same references until something changes (safe for useSyncExternalStore)', () => {
    const s = createAccountStore(memStorage());
    s.upsert(acc('1'));
    const a = s.list(), b = s.active();
    expect(s.list()).toBe(a);
    expect(s.active()).toBe(b);
    s.upsert(acc('2'));
    expect(s.list()).not.toBe(a);
  });

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const s = createAccountStore(memStorage());
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.upsert(acc('1'));
    s.setActive('1');
    s.setActiveLeague('1', 'L');
    s.remove('1');
    expect(fn).toHaveBeenCalledTimes(4);
    off();
    s.upsert(acc('2'));
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('survives blocked storage by working from memory', () => {
    const s = createAccountStore(blocked());
    const fn = vi.fn();
    s.subscribe(fn);
    expect(() => s.upsert(acc('1'))).not.toThrow();
    s.setActiveLeague('1', 'L1');
    expect(s.list()).toHaveLength(1);
    expect(s.active()?.activeLeagueId).toBe('L1');
    expect(fn).toHaveBeenCalled();
  });

  it('ignores corrupt stored data', () => {
    const st = memStorage();
    st.setItem(ACCOUNTS_KEY, '{not json');
    const s = createAccountStore(st);
    expect(s.list()).toEqual([]);
    s.upsert(acc('1'));
    expect(s.list()).toHaveLength(1);
  });

  it('drops malformed entries', () => {
    const st = memStorage();
    st.setItem(ACCOUNTS_KEY, JSON.stringify({ accounts: [acc('1'), { userId: 5 }, null], activeUserId: '1' }));
    expect(createAccountStore(st).list().map((a) => a.userId)).toEqual(['1']);
  });
});
