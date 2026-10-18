import { useState } from 'react';
import { loadPrefs, savePrefs } from '../../app/prefs';
import { Disclosure } from '../../components/Disclosure';

export function ScheduleSection() {
  const [auto, setAuto] = useState(() => loadPrefs().autoRefresh);
  return (
    <Disclosure title="Refresh schedule" id="set-schedule" hint={auto ? 'auto-refresh on' : 'auto-refresh off'}>
      <p>Refreshes on open when data is older than 6 hours; the players file at most once a day. The Refresh button on each page always goes back to the network, and requests stay well under Sleeper’s limits.</p>
      <label className="row">
        <input
          type="checkbox" checked={auto}
          onChange={(e) => { setAuto(e.target.checked); savePrefs({ autoRefresh: e.target.checked }); }}
        />
        <span>Auto-refresh on open</span>
      </label>
    </Disclosure>
  );
}
