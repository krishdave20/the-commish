import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void): () => void {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
}

/** Whether the browser thinks it is online. Server render and a browser without the flag count as online. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' ? true : navigator.onLine), () => true);
}
