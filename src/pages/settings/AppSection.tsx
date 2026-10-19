import { useState } from 'react';
import { Disclosure } from '../../components/Disclosure';
import { Segmented } from '../../components/Segmented';
import { PAGES } from '../../app/names';
import { isIos, isStandalone, useInstall } from '../../app/pwa/install';
import { deliver, notificationPermission, requestAlertPermission } from '../../app/pwa/notify';
import type { PermissionState } from '../../app/pwa/notify';
import { saveAlertsEnabled, useAlertsEnabled } from '../../app/pwa/alertsStore';
import { useSwStatus } from '../../app/pwa/register';
import { useOnline } from '../../app/pwa/useOnline';
import '../../styles/pwa.css';

/** The iOS share button: a box with an arrow leaving the top. Drawn in the app's fine line (1.4 px). */
export function ShareIcon() {
  return (
    <svg className="pwa-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 15V3.5M8 7l4-4 4 4" />
      <path d="M7.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10h-1" />
    </svg>
  );
}

function InstallBlock() {
  const { mode, install } = useInstall();
  const [note, setNote] = useState<string | null>(null);
  if (mode === 'installed') {
    return <p><span className="chip up">installed</span> <span className="dim">the commish is on this device and opens like an app.</span></p>;
  }
  if (mode === 'prompt') {
    return (
      <div className="stack">
        <p>install the commish to open it from your dock, home screen or app list, in its own window. it works offline, with the last data it saved.</p>
        <div className="row">
          <button type="button" className="btn solid" onClick={() => { void install().then((r) => setNote(r === 'dismissed' ? 'no problem. the button comes back next time the browser offers it.' : null)); }}>
            install the commish
          </button>
          {note && <span className="note" role="status">{note}</span>}
        </div>
      </div>
    );
  }
  if (mode === 'ios') {
    return (
      <div className="stack">
        <p>on iphone and ipad, safari installs it from the share sheet:</p>
        <ol className="pwa-steps">
          <li>tap the share button <ShareIcon /> in safari&rsquo;s toolbar</li>
          <li>choose <strong>Add to Home Screen</strong></li>
          <li>tap <strong>Add</strong>. the commish opens from your home screen like an app.</li>
        </ol>
      </div>
    );
  }
  return (
    <p className="note">
      this browser has not offered an install button. in chrome or edge, look for the install icon in the address bar; in safari on a mac, use File → Add to Dock.
    </p>
  );
}

function OfflineBlock() {
  const sw = useSwStatus();
  const online = useOnline();
  return (
    <div className="pwa-status">
      {sw === 'ready' && <span className="chip up">works offline</span>}
      {sw === 'registering' && <span className="chip flat">saving for offline…</span>}
      {(sw === 'idle' || sw === 'unsupported' || sw === 'error') && <span className="chip flat">offline copy not active</span>}
      {!online && <span className="chip gold">you are offline now</span>}
      <span className="note">
        {sw === 'ready'
          ? 'the app opens without a connection and shows the last data it saved, with its "data as of" time.'
          : 'the offline copy starts after the first visit to the published site (it is off in the dev server).'}
      </span>
    </div>
  );
}

function AlertsBlock() {
  const enabled = useAlertsEnabled();
  const [perm, setPerm] = useState<PermissionState>(() => notificationPermission());
  const [note, setNote] = useState<string | null>(null);
  const on = enabled && perm === 'granted';

  async function change(v: 'on' | 'off') {
    setNote(null);
    if (v === 'off') { saveAlertsEnabled(false); return; }
    // the browser's permission prompt opens here, on this tap, and nowhere else
    const p = perm === 'granted' || perm === 'denied' ? perm : await requestAlertPermission();
    setPerm(p);
    if (p === 'granted') { saveAlertsEnabled(true); return; }
    saveAlertsEnabled(false);
    setNote(
      p === 'denied' ? 'alerts are blocked for this site. allow notifications in the browser’s site settings, then switch this on.'
        : p === 'unsupported' && isIos() && !isStandalone() ? 'iphone and ipad only allow alerts from an app on the Home Screen (ios 16.4 or later). add the commish first, then come back here.'
          : p === 'unsupported' ? 'this browser does not support notifications.'
            : 'no permission was given, so alerts stay off.',
    );
  }

  return (
    <div className="stack">
      <p>alerts while the app is open: waivers in 1 hour, kickoff in 30 minutes, you&rsquo;re on the clock, the final score, and a big moment in your matchup (+6 points).</p>
      <Segmented
        label="Alerts while the app is open" value={on ? 'on' : 'off'} onChange={(v) => { void change(v); }}
        options={[{ value: 'on', label: 'alerts: on' }, { value: 'off', label: 'alerts: off' }]}
      />
      <p className="note"><strong>alerts only arrive while the commish is open (no server, by design).</strong> a tab in the background or an installed app counts as open; a closed app cannot be reached. at most one every 10 minutes, except when you&rsquo;re on the clock.</p>
      {on && (
        <div className="row">
          <button type="button" className="btn" onClick={() => { void deliver({ title: 'the commish', body: 'alerts are on. this is what one looks like.', tag: 'test', to: PAGES.settings.path }).then((ok) => setNote(ok ? null : 'could not show a notification here.')); }}>
            send a test alert
          </button>
        </div>
      )}
      {note && <p className="note" role="status">{note}</p>}
    </div>
  );
}

/** Front office "app": install (a button where the browser offers one, the Share steps on iOS, "installed" once it is), the offline copy, and local alerts. */
export function AppSection() {
  const { mode } = useInstall();
  const enabled = useAlertsEnabled();
  const hint = mode === 'installed' ? 'installed' : enabled ? 'alerts on' : undefined;
  return (
    <Disclosure title="app" id="set-app" hint={hint}>
      <div className="stack">
        <InstallBlock />
        <OfflineBlock />
        <AlertsBlock />
      </div>
    </Disclosure>
  );
}
