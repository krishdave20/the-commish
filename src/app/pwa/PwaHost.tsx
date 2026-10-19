import { AlertsRunner } from './AlertsRunner';
import { OfflineChip } from './OfflineChip';
import { UpdatePrompt } from './UpdatePrompt';
import '../../styles/pwa.css';

/** Everything the installable app adds to the frame, in one mount: the offline chip (top right), the "new version is ready" prompt (bottom) and the
    alerts runner (no output). Mount it once inside the moments provider (AppShell). */
export function PwaHost() {
  return (
    <>
      <OfflineChip />
      <UpdatePrompt />
      <AlertsRunner />
    </>
  );
}
