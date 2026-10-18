/* Accessibility scan (axe-core) for the smoke test.
   Every route is scanned at desktop width. serious and critical violations fail the test, except the ones listed in
   ALLOWED_AXE below. The full report (every impact level, every node) goes to e2e/results/axe-report.json. */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export interface AxeNode { target: string; html: string; summary: string }
/** `route` is the route id used in smoke.spec.ts (stable, unlike a path that carries a player id); `path` is the hash route. */
export interface AxeFinding { route: string; path: string; rule: string; impact: string; help: string; helpUrl: string; nodes: AxeNode[] }

/* Allow-list of axe violations waived for now. It is empty: serious and critical violations fail the test. If one ever has to be
   waived, add { rule, route (the route id in smoke.spec.ts), nodes (max elements), note } here with the reason, and remove it
   again once fixed (the test also fails when an entry no longer matches any violation). */
export const ALLOWED_AXE: Array<{ rule: string; route: string; nodes: number; note: string }> = [];

export const FAIL_IMPACTS = new Set(['serious', 'critical']);

export async function scan(page: Page, route: string, path: string): Promise<AxeFinding[]> {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.map((v) => ({
    route, path, rule: v.id, impact: v.impact ?? 'minor', help: v.help, helpUrl: v.helpUrl,
    nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 200), summary: (n.failureSummary ?? '').replace(/\s+/g, ' ').trim() })),
  }));
}

export const isAllowed = (f: Pick<AxeFinding, 'rule' | 'route' | 'nodes'>) => ALLOWED_AXE.some((a) => a.rule === f.rule && a.route === f.route && f.nodes.length <= a.nodes);

/** rule → routes, one line each, for the console summary */
export function summarize(findings: AxeFinding[]): string[] {
  const byRule = new Map<string, { impact: string; routes: Map<string, number> }>();
  for (const f of findings) {
    const e = byRule.get(f.rule) ?? { impact: f.impact, routes: new Map() };
    e.routes.set(f.route, (e.routes.get(f.route) ?? 0) + f.nodes.length);
    byRule.set(f.rule, e);
  }
  return [...byRule.entries()].map(([rule, e]) => `  ${rule} (${e.impact}): ${[...e.routes.entries()].map(([r, n]) => `${r} x${n}`).join(', ')}`);
}
