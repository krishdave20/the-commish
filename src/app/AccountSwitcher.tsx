import { Link } from 'react-router-dom';
import { useAccountStore, useAccounts, useActive, useLeagueBundles } from './hooks';

/** Sidebar footer: who is signed in, which league is followed, and a way to add another account. */
export function AccountSwitcher() {
  const accounts = useAccountStore();
  const { data: list = [] } = useAccounts();
  const { data: active } = useActive();
  const account = active?.account ?? null;
  const bundles = useLeagueBundles(account?.leagueIds ?? []);

  if (!account) return null;

  return (
    <div className="switcher">
      <div>
        <div className="micro">Signed in</div>
        <div className="who">{account.displayName}</div>
      </div>
      {list.length > 1 && (
        <label className="ctl">
          Account
          <select value={account.userId} onChange={(e) => accounts.setActive(e.target.value)}>
            {list.map((a) => <option key={a.userId} value={a.userId}>{a.displayName} (@{a.username})</option>)}
          </select>
        </label>
      )}
      {account.leagueIds.length > 0 && (
        <label className="ctl">
          League
          <select value={active?.leagueId ?? ''} onChange={(e) => accounts.setActiveLeague(account.userId, e.target.value)}>
            {account.leagueIds.map((id) => <option key={id} value={id}>{bundles[id]?.league.name ?? id}</option>)}
          </select>
        </label>
      )}
      <Link className="add" to="/signin">Add an account</Link>
    </div>
  );
}
