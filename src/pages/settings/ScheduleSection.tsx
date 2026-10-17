import { useState } from 'react';
import { loadPrefs, savePrefs } from '../../app/prefs';

export function ScheduleSection() {
  const [auto, setAuto] = useState(() => loadPrefs().autoRefresh);
  return (
    <section className="section" aria-labelledby="set-schedule">
      <h2 id="set-schedule">Refresh schedule</h2>
      <p>Refreshes on open when data is older than 6 hours; the players file at most once a day.</p>
      <p className="note">The Refresh button on each page always goes back to the network. Requests are kept well under Sleeper’s limits.</p>
      <label className="row">
        <input
          type="checkbox" checked={auto}
          onChange={(e) => { setAuto(e.target.checked); savePrefs({ autoRefresh: e.target.checked }); }}
        />
        <span>Auto-refresh on open</span>
      </label>
    </section>
  );
}
