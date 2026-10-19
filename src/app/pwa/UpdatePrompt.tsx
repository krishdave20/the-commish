import { useState } from 'react';
import { applyUpdate, useSwUpdate } from './register';

/** "a new version is ready · reload" while a new service worker waits. "later" hides it until the next time a worker is found. */
export function UpdatePrompt() {
  const waiting = useSwUpdate();
  const [later, setLater] = useState(false);
  if (!waiting || later) return null;
  return (
    <div className="pwa-update" role="status">
      <span>a new version is ready</span>
      <span aria-hidden="true">·</span>
      <button type="button" className="btn solid" onClick={() => applyUpdate()}>reload</button>
      <button type="button" className="btn quiet" onClick={() => setLater(true)}>later</button>
    </div>
  );
}
