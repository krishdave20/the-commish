/* Start every run with empty screenshot / axe / overflow folders so e2e/results/ only ever shows the current run. */
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default function globalSetup() {
  const results = resolve(import.meta.dirname, 'results');
  for (const sub of ['screens', 'axe', 'overflow']) {
    rmSync(resolve(results, sub), { recursive: true, force: true });
    mkdirSync(resolve(results, sub), { recursive: true });
  }
  rmSync(resolve(results, 'axe-report.json'), { force: true });
  for (const p of ['desktop', 'phone', 'phone320', 'phone430']) rmSync(resolve(results, `overflow-${p}.json`), { force: true });
}
