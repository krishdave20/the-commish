import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CommissionersOffice } from '../components/art/CommissionersOffice';
import { AccountList } from '../components/AccountList';
import { InfoTip } from '../components/InfoTip';
import { SkipLink } from '../components/SkipLink';
import { useAccountStore, useAccounts, useActive, useApi } from '../app/hooks';
import { PAGES } from '../app/names';
import { usePageTitle } from '../app/usePageTitle';
import { leagueScoring, leagueTypeLabel, statusLabel } from '../app/league';
import type { SleeperLeague, SleeperUser } from '../data';

type Step =
  | { kind: 'idle' }
  | { kind: 'busy'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'pick'; user: SleeperUser; leagues: SleeperLeague[]; primarySeason: string };

export default function SignIn() {
  const api = useApi();
  usePageTitle(PAGES.signin.path);
  const store = useAccountStore();
  const navigate = useNavigate();
  const { data: linked = [] } = useAccounts();
  const { data: active } = useActive();

  const [username, setUsername] = useState('');
  const [phase, setPhase] = useState<Step>({ kind: 'idle' });
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function find(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    setPhase({ kind: 'busy', text: 'Looking up your Sleeper account…' });
    try {
      const user = await api.user(name);
      if (!user) {
        setPhase({ kind: 'error', text: `No Sleeper account named “${name}”.` });
        return;
      }
      setPhase({ kind: 'busy', text: 'Loading your leagues…' });
      const state = (await api.nflState()).data;
      const primarySeason = state.league_season ?? state.season;
      const seasons = [primarySeason];
      if ((state.season_type === 'off' || state.season_type === 'pre') && state.previous_season) {
        seasons.push(state.previous_season);
      }
      const results = await Promise.all(seasons.map((s) => api.userLeagues(user.user_id, s)));
      const seen = new Set<string>();
      const leagues: SleeperLeague[] = [];
      for (const res of results) {
        for (const lg of res.data) {
          if (!seen.has(lg.league_id)) { seen.add(lg.league_id); leagues.push(lg); }
        }
      }
      const existing = linked.find((a) => a.userId === user.user_id);
      const current = leagues.filter((l) => l.season === primarySeason);
      const defaults = existing
        ? leagues.filter((l) => existing.leagueIds.includes(l.league_id))
        : current.length > 0 ? current : leagues;
      setPicked(new Set(defaults.map((l) => l.league_id)));
      setPhase({ kind: 'pick', user, leagues, primarySeason });
    } catch (err) {
      setPhase({ kind: 'error', text: `Could not reach Sleeper. ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function save() {
    if (phase.kind !== 'pick') return;
    const { user, leagues } = phase;
    const leagueIds = leagues.filter((l) => picked.has(l.league_id)).map((l) => l.league_id);
    const existing = linked.find((a) => a.userId === user.user_id);
    const activeLeagueId = existing?.activeLeagueId && leagueIds.includes(existing.activeLeagueId)
      ? existing.activeLeagueId
      : (leagueIds[0] ?? null);
    store.upsert({
      userId: user.user_id,
      username: user.username ?? username.trim(),
      displayName: user.display_name,
      avatar: user.avatar,
      leagueIds,
      activeLeagueId,
      addedAt: existing?.addedAt ?? Date.now(),
    });
    store.setActive(user.user_id);
    navigate('/');
  }

  const busy = phase.kind === 'busy';

  return (
    <>
      <SkipLink />
      <main className="signin-wrap" id="main" tabIndex={-1}>
        <div className="signin page-fade">
          <div className="art-head">
            <header className="page-head">
              <div className="micro">the commish · {PAGES.signin.kicker}</div>
              <h1>{PAGES.signin.name}</h1>
              <div className="title-row">
                <p className="note">Enter a Sleeper username to follow your leagues.</p>
                <InfoTip label="no password">
                  There is no password: Sleeper does not offer one to third-party apps, and this app only reads public league data.
                </InfoTip>
              </div>
            </header>
            <CommissionersOffice className="art-head-office" size={136} />
          </div>

          <form className="stack" onSubmit={(e) => { void find(e); }}>
            <div className="form-row">
              <label className="ctl">
                Sleeper username
                <input
                  type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off" autoCapitalize="off" spellCheck={false} required
                />
              </label>
              <button type="submit" className="btn solid" disabled={busy || !username.trim()}>Find my leagues</button>
              {active && <Link to="/" className="btn quiet">Back to the commish</Link>}
            </div>
            {phase.kind === 'busy' && <p className="msg note" role="status">{phase.text}</p>}
            {phase.kind === 'error' && <p className="msg err" role="alert">{phase.text}</p>}
          </form>

          {phase.kind === 'pick' && (
            <section className="stack" aria-labelledby="pick-title">
              <div>
                <div className="micro">Found {phase.user.display_name} on Sleeper</div>
                <h2 id="pick-title">Choose leagues to follow</h2>
              </div>
              {phase.leagues.length === 0 && (
                <p className="note">No NFL leagues found for this account in the current or previous season.</p>
              )}
              <div className="stack">
                {phase.leagues.map((lg) => (
                  <label key={lg.league_id} className="pick">
                    <input type="checkbox" checked={picked.has(lg.league_id)} onChange={() => toggle(lg.league_id)} />
                    <span>
                      <span className="pick-name">{lg.name}</span>
                      <span className="pick-meta">
                        <span>{lg.season}</span>
                        <span>{statusLabel(lg.status)}</span>
                        <span>{lg.total_rosters} teams</span>
                        <span>{leagueScoring(lg)}</span>
                        <span>{leagueTypeLabel(lg.settings.type)}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="row">
                <button type="button" className="btn solid" disabled={picked.size === 0} onClick={save}>Save and continue</button>
                <span className="note">{picked.size} selected</span>
              </div>
            </section>
          )}

          <section className="stack" aria-labelledby="linked-title">
            <h2 id="linked-title">Linked accounts</h2>
            <AccountList
              accounts={linked}
              activeId={active?.account.userId ?? null}
              onSwitch={(id) => { store.setActive(id); navigate('/'); }}
              onRemove={(id) => store.remove(id)}
            />
          </section>
        </div>
      </main>
    </>
  );
}
