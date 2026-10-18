import { useState } from 'react';
import { APP_VERSION } from '../../app/appInfo';
import { loadPrefs, savePrefs } from '../../app/prefs';
import { checkForUpdate } from '../../app/version';
import { Disclosure } from '../../components/Disclosure';
import type { UpdateCheck } from '../../app/version';

export function AboutSection() {
  const [url, setUrl] = useState(() => loadPrefs().updateUrl);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    setResult(await checkForUpdate(url, APP_VERSION));
    setChecking(false);
  }

  return (
    <Disclosure title="About" id="set-about" hint={`version ${APP_VERSION}`}>
      <dl className="defs">
        <dt>Version</dt><dd>{APP_VERSION}</dd>
      </dl>
      <p>Free public data only. No AI or paid services at runtime.</p>
      <div className="form-row">
        <label className="ctl">
          Update file URL (version.json)
          <input
            type="url" value={url} placeholder="https://example.com/version.json"
            onChange={(e) => { setUrl(e.target.value); savePrefs({ updateUrl: e.target.value.trim() }); setResult(null); }}
          />
        </label>
        <button type="button" className="btn" onClick={() => { void check(); }} disabled={checking}>Check for updates</button>
      </div>
      {result && (
        <p className={`msg ${result.kind === 'error' ? 'err' : result.kind === 'available' ? 'pos-c' : 'note'}`} role="status">
          {result.message}
        </p>
      )}
    </Disclosure>
  );
}
