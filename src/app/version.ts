/* "Check for updates": compare this build's version with an optional version.json. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type UpdateCheck =
  | { kind: 'unset'; message: string }
  | { kind: 'current'; message: string }
  | { kind: 'available'; message: string; latest: string }
  | { kind: 'error'; message: string };

export async function checkForUpdate(
  url: string,
  current: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<UpdateCheck> {
  const target = url.trim();
  if (!target) return { kind: 'unset', message: 'No update URL set.' };
  try {
    const res = await fetchImpl(target, { cache: 'no-store' });
    if (!res.ok) return { kind: 'error', message: `Could not read the update file (HTTP ${res.status}).` };
    const body = (await res.json()) as { version?: unknown };
    if (typeof body.version !== 'string') return { kind: 'error', message: 'The update file has no "version" field.' };
    if (compareVersions(current, body.version) < 0) {
      return { kind: 'available', latest: body.version, message: `Update available: ${body.version} (you have ${current}).` };
    }
    return { kind: 'current', message: `You are up to date (${current}).` };
  } catch (e) {
    return { kind: 'error', message: `Could not check for updates: ${e instanceof Error ? e.message : String(e)}` };
  }
}
