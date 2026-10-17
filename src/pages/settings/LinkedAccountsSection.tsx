import { useNavigate } from 'react-router-dom';
import { AccountList } from '../../components/AccountList';
import { useAccountStore, useAccounts, useActive, useApi } from '../../app/hooks';
import { useData } from '../../app/dataContext';

export function LinkedAccountsSection() {
  const accounts = useAccountStore();
  const api = useApi();
  const { store } = useData();
  const navigate = useNavigate();
  const { data: list = [] } = useAccounts();
  const { data: active } = useActive();

  async function signOut() {
    const target = active?.account;
    if (!target) return;
    await api.clearCache();
    accounts.remove(target.userId);
    store.clear();
    if (accounts.list().length === 0) navigate('/signin');
  }

  return (
    <section className="section" aria-labelledby="set-accounts">
      <h2 id="set-accounts">Linked accounts</h2>
      <p className="note">Accounts are remembered on this device only. Pick which one to view, or remove it.</p>
      <AccountList
        accounts={list}
        activeId={active?.account.userId ?? null}
        onSwitch={(id) => accounts.setActive(id)}
        onRemove={(id) => accounts.remove(id)}
      />
      <div className="row">
        <button type="button" className="btn warn" onClick={() => { void signOut(); }} disabled={!active}>Sign out</button>
        <span className="note">Signing out removes the active account and clears the saved data.</span>
      </div>
    </section>
  );
}
