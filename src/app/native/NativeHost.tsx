import { useEffect, useRef } from 'react';
import { useModel } from '../modelContext';
import { isNativeApp, postNative } from './bridge';

/** The iPhone app's side of a site page opened from the app (no output). Mount once in the shell; outside the app it does nothing.
    It answers the app's pull to refresh (`commish:refresh`): pulls everything again, then tells the app to stop its spinner. The Live Activity
    and the native screens are fed by the hidden feed page (NativeFeed.tsx), not by the page on screen. */
export function NativeHost() {
  const native = isNativeApp();
  const { refresh } = useModel();
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!native) return;
    const onRefresh = () => {
      void refreshRef.current().catch(() => { /* the page shows its own error; the spinner still stops */ }).finally(() => postNative({ type: 'refreshed' }));
    };
    window.addEventListener('commish:refresh', onRefresh);
    return () => window.removeEventListener('commish:refresh', onRefresh);
  }, [native]);
  return null;
}
