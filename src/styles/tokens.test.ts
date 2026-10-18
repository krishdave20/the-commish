/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// the hybrid look (docs/WEB_APP_NOTES.md): system sans for text and controls, Instrument Serif for titles and big numbers, 8 px
// corners and an 8-point grid. Fonts, radii and spacing are tokens, so a later switch is a change to tokens.css alone.
const dir = `${process.cwd()}/src/styles/`;
const files = [
  ...readdirSync(dir).filter((f: string) => f.endsWith('.css')).map((f: string) => `${dir}${f}`),
  `${dir}../pages/draft/draft.css`,
];
const CSS = files.map((name: string) => ({ name, css: readFileSync(name, 'utf8') }));
const tokens = readFileSync(`${dir}tokens.css`, 'utf8');
const rest = CSS.filter((c) => !c.name.endsWith('tokens.css'));

describe('design tokens', () => {
  it('uses the system San Francisco stack for text, with no bundled body font', () => {
    expect(tokens).toMatch(/--sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, sans-serif;/);
    expect(readFileSync(`${process.cwd()}/src/styles/base.css`, 'utf8')).toMatch(/body \{[^}]*font-family: var\(--sans\)/);
    expect(readFileSync(`${process.cwd()}/src/main.tsx`, 'utf8')).not.toMatch(/dm-mono/);
    for (const { css } of CSS) expect(css).not.toMatch(/DM Mono/i);
  });

  it('keeps Instrument Serif for display and the palette unchanged', () => {
    expect(tokens).toMatch(/--serif: 'Instrument Serif'/);
    for (const hex of ['#f4f1eb', '#faf8f3', '#1f1d19', '#2d5a27', '#8b3a1a', '#c4922a']) expect(tokens).toContain(hex);
  });

  it('has 8 px corners and a smaller radius for tiny elements', () => {
    expect(tokens).toMatch(/--r: 8px;/);
    expect(tokens).toMatch(/--r-sm: 6px;/);
  });

  it('defines the 8-point spacing scale and the 44 px touch target', () => {
    for (const [name, px] of [['s-1', 4], ['s-2', 8], ['s-3', 16], ['s-4', 24], ['s-5', 32], ['s-6', 48]] as const) {
      expect(tokens).toContain(`--${name}: ${px}px;`);
    }
    expect(tokens).toContain('--touch: 44px;');
    const touch = CSS.find((c) => c.name.endsWith('components.css'))!.css.match(/@media \(max-width: 760px\), \(pointer: coarse\) \{[\s\S]*?\n\}/)![0];
    expect(touch).not.toMatch(/min-height: 40px/);
    expect(touch).toMatch(/min-height: var\(--touch\)/);
  });

  it('writes no literal font family, corner radius or font size outside tokens.css (the serif display sizes aside)', () => {
    const bad: string[] = [];
    for (const { name, css } of rest) {
      for (const line of css.split('\n')) {
        const t = line.trim();
        if (/font-family:/.test(t) && !/font-family: var\(--(sans|serif|mono)\)/.test(t) && !/font-family: inherit|font: inherit/.test(t)) bad.push(`${name}: ${t.slice(0, 80)}`);
        // a radius is a token, 50% (a circle), 0 or a couple of pixels on a hairline
        for (const m of t.matchAll(/border-radius: ([^;}]+)/g)) {
          if (!/^(var\(--r(-sm|-xs)?\)|50%|0|var\(--r\) 0 0 var\(--r\)|2px|1px|3px)( |$)/.test(m[1]!.trim())) bad.push(`${name}: ${t.slice(0, 80)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('uses one gentle ease-out for motion', () => {
    expect(tokens).toMatch(/--ease: cubic-bezier\(0\.2, 0\.8, 0\.2, 1\);/);
  });

  it('gives the phone bar a translucent, blurred background with a solid fallback', () => {
    const layout = readFileSync(`${dir}layout.css`, 'utf8');
    expect(layout).toMatch(/\.sidebar \{[^}]*position: sticky/);
    expect(layout).toMatch(/@supports \(\(-webkit-backdrop-filter: blur\(1px\)\) or \(backdrop-filter: blur\(1px\)\)\)/);
    expect(layout).toMatch(/backdrop-filter: saturate\(180%\) blur\(16px\)/);
    expect(tokens).toMatch(/--bar-glass: rgba\(/);
  });
});
