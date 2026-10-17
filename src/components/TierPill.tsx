import { tierOf } from '../app/metrics';

interface Props {
  /** playoff probability from 0 to 1 */
  p: number;
  /** a mathematically settled state overrides the tier */
  status?: 'clinched' | 'eliminated';
  /** odds still simulating: no tier yet (a clinched or eliminated status still shows) */
  pending?: boolean;
}

/** Lock, Likely, Bubble, Long shot or Done from the playoff chance; Clinched and Eliminated when settled. */
export function TierPill({ p, status, pending = false }: Props) {
  if (status === 'clinched') return <span className="pill solid-ok">Clinched</span>;
  if (status === 'eliminated') return <span className="pill solid-bad">Eliminated</span>;
  if (pending) return <span className="dim">…</span>;
  const t = tierOf(p);
  return <span className={`pill ${t.pill}`}>{t.label}</span>;
}
