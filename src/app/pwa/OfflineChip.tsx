import { useOnline } from './useOnline';

/** A small "offline" chip for the header area. While the device is offline the app runs from its saved copy and every page's "data as of" stamp
    says how old the numbers are; this says why. The live region is always there (and empty when online) so the change is announced. */
export function OfflineChip({ className }: { className?: string }) {
  const online = useOnline();
  return (
    <span className={className ?? 'pwa-offline'} role="status">
      {!online && <span className="chip gold">offline · showing saved data</span>}
    </span>
  );
}
