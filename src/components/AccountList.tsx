import type { LinkedAccount } from '../data';

interface Props {
  accounts: LinkedAccount[];
  activeId: string | null;
  onSwitch: (userId: string) => void;
  onRemove: (userId: string) => void;
}

/** Linked accounts with Switch and Remove. Shared by Sign in and Settings. */
export function AccountList({ accounts, activeId, onSwitch, onRemove }: Props) {
  if (accounts.length === 0) return <p className="note">No accounts linked on this device.</p>;
  return (
    <ul className="plain" aria-label="Linked accounts">
      {accounts.map((a) => {
        const isActive = a.userId === activeId;
        return (
          <li key={a.userId} className="acct">
            <div>
              <div className="acct-name">{a.displayName}</div>
              <div className="note">
                @{a.username} · {a.leagueIds.length} {a.leagueIds.length === 1 ? 'league' : 'leagues'}
                {isActive && <> · <span className="pos-c">active</span></>}
              </div>
            </div>
            <div className="row">
              <button type="button" className="btn" disabled={isActive} onClick={() => onSwitch(a.userId)}
                aria-label={`Switch to ${a.displayName}`}>
                Switch
              </button>
              <button type="button" className="btn warn" onClick={() => onRemove(a.userId)}
                aria-label={`Remove ${a.displayName}`}>
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
