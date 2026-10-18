/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// every stylesheet in the app, as text (read from disk: vitest blanks css imports)
const dir = `${process.cwd()}/src/styles/`;
const files = [
  ...readdirSync(dir).filter((f: string) => f.endsWith('.css')).map((f: string) => `${dir}${f}`),
  `${dir}../pages/draft/draft.css`,
];
const CSS = files.map((name: string) => ({ name, css: readFileSync(name, 'utf8') }));
const all = CSS.map((c) => c.css).join('\n');

describe('motion in the stylesheets', () => {
  it('has one net under every animation and transition for prefers-reduced-motion: reduce', () => {
    const reduce = all.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g)?.join('\n') ?? '';
    expect(reduce).toMatch(/animation-duration: 0\.01ms !important/);
    expect(reduce).toMatch(/transition-duration: 0\.01ms !important/);
    expect(reduce).toMatch(/animation-iteration-count: 1 !important/);
  });

  it('defines the three durations on the shared curve and keeps them between 150 and 550 ms', () => {
    expect(all).toMatch(/--t-fast: 150ms/);
    expect(all).toMatch(/--t-base: 300ms/);
    expect(all).toMatch(/--t-slow: 550ms/);
    expect(all).toMatch(/--ease: cubic-bezier\(0\.2, 0\.7, 0\.2, 0\.7?2?\)|--ease: cubic-bezier/);
  });

  it('writes no literal duration outside 150 to 550 ms (the indeterminate progress bar loop aside)', () => {
    const bad: string[] = [];
    for (const { name, css } of CSS) {
      for (const line of css.split('\n')) {
        if (!/(animation|transition)\s*:/.test(line) || /infinite/.test(line)) continue;
        for (const m of line.matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)\b/g)) {
          const ms = m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]);
          if (ms < 150 || ms > 550) bad.push(`${name}: ${line.trim().slice(0, 90)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
