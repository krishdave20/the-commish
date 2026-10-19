import { watchInstall } from './install';
import { registerServiceWorker } from './register';

export { PwaHost } from './PwaHost';
export { OfflineChip } from './OfflineChip';
export { UpdatePrompt } from './UpdatePrompt';
export { useOnline } from './useOnline';

/** Called once at app start (src/main.tsx): listens for the browser's install offer and registers the service worker (production builds only; every step is guarded). */
export function startPwa(): void {
  watchInstall();
  void registerServiceWorker();
}
