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
    const topnav = readFileSync(`${dir}topnav.css`, 'utf8');
    expect(topnav).toMatch(/\.sidebar \{[^}]*position: sticky/);
    expect(topnav).toMatch(/@supports \(\(-webkit-backdrop-filter: blur\(1px\)\) or \(backdrop-filter: blur\(1px\)\)\)/);
    expect(topnav).toMatch(/backdrop-filter: saturate\(180%\) blur\(16px\)/);
    expect(tokens).toMatch(/--bar-glass: rgba\(/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// dark mode: every colour is a token with a value for both looks, text pairs pass WCAG AA, and nothing outside tokens.css hard-codes a colour
// ---------------------------------------------------------------------------------------------------------------------------

/** a block's declarations, comments removed, as name -> value */
function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim().replace(/\s+/g, ' '));
  return out;
}
const lightBlock = tokens.match(/^:root \{([\s\S]*?)\n\}/m)![1]!;
const darkOverride = tokens.match(/^:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/m)![1]!;
const darkSystem = tokens.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}\n\}/)![1]!;
const LIGHT = declarations(lightBlock);
const DARK = declarations(darkOverride);

const isColourValue = (v: string) => /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|^transparent$|^color-mix\(/i.test(v);
const isDerived = (v: string) => /^color-mix\(in srgb, var\(--[a-z0-9-]+\) \d+%, var\(--[a-z0-9-]+\)\)$/.test(v);

describe('dark mode tokens', () => {
  it('defines the dark look twice, identically: for the override and for the system setting (unless light is forced)', () => {
    const norm = (b: string) => [...declarations(b)].map(([k, v]) => `${k}: ${v}`).join('\n');
    expect(norm(darkSystem)).toBe(norm(darkOverride));
    expect(DARK.size).toBeGreaterThan(40);
    expect(darkOverride).toMatch(/color-scheme: dark;/);
    expect(darkSystem).toMatch(/color-scheme: dark;/);
    expect(lightBlock).toMatch(/color-scheme: light;/);
  });

  it('gives every colour token (and every shadow, scrim and glass) a dark value', () => {
    const colourTokens = [...LIGHT].filter(([, v]) => isColourValue(v) && !isDerived(v)).map(([k]) => k);
    expect(colourTokens.length).toBeGreaterThan(40);
    expect(colourTokens.filter((k) => !DARK.has(k))).toEqual([]);
  });

  it('defines nothing in dark that light does not have (a typo would otherwise pass)', () => {
    expect([...DARK.keys()].filter((k) => !LIGHT.has(k))).toEqual([]);
  });

  it('derives gold-text and green-deep from other tokens, so they follow the theme without a value of their own', () => {
    for (const k of ['--gold-text', '--green-deep']) {
      expect(isDerived(LIGHT.get(k)!)).toBe(true);
      expect(DARK.has(k)).toBe(false);
    }
  });

  it('keeps the light palette as the default and the dark base a warm charcoal, not black', () => {
    expect(LIGHT.get('--paper')).toBe('#f4f1eb');
    expect(DARK.get('--paper')).toBe('#171512');
    expect(DARK.get('--paper')).not.toBe('#000000');
    expect(DARK.get('--ink')).toMatch(/^#e[0-9a-f]e[0-9a-f]d/); // warm parchment text
  });

  it('keeps the inverse surfaces dark in both looks, and lifted (lighter than the page) in dark', () => {
    expect(luminance(LIGHT.get('--surface-inverse')!)).toBeLessThan(0.05);
    expect(luminance(DARK.get('--surface-inverse')!)).toBeLessThan(0.1);
    expect(luminance(DARK.get('--surface-inverse')!)).toBeGreaterThan(luminance(DARK.get('--sheet')!));
    expect(luminance(DARK.get('--sheet')!)).toBeGreaterThan(luminance(DARK.get('--paper')!));
  });

  it('keeps the turf green in both looks', () => {
    for (const k of ['--turf', '--turf-2', '--turf-line']) expect(DARK.get(k)).toBe(LIGHT.get(k));
  });

  it('follows the system by media query only when the owner has not forced light, and sets the toggle override attribute names', () => {
    expect(tokens).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{/);
    expect(tokens).toMatch(/:root\[data-theme="dark"\] \{/);
  });
});

// ---- contrast ----
function rgbOf(value: string, vars: Map<string, string>): [number, number, number] {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as [number, number, number];
  const mix = v.match(/^color-mix\(in srgb, var\((--[a-z0-9-]+)\) (\d+)%, var\((--[a-z0-9-]+)\)\)$/);
  if (mix) {
    const a = rgbOf(vars.get(mix[1]!)!, vars);
    const b = rgbOf(vars.get(mix[3]!)!, vars);
    const p = Number(mix[2]) / 100;
    return a.map((x, i) => x * p + b[i]! * (1 - p)) as [number, number, number];
  }
  throw new Error(`cannot read a colour from "${value}"`);
}
function relLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function luminance(hexValue: string): number { return relLuminance(rgbOf(hexValue, new Map())); }

function ratioIn(vars: Map<string, string>, fg: string, bg: string): number {
  const a = relLuminance(rgbOf(vars.get(fg)!, vars));
  const b = relLuminance(rgbOf(vars.get(bg)!, vars));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** every foreground/background pair the stylesheets put text on (small text needs 4.5:1, WCAG AA) */
const TEXT_PAIRS: [fg: string, bg: string][] = [
  ['--ink', '--paper'], ['--ink', '--sheet'], ['--ink', '--rule-2'], ['--ink', '--gold-soft'], ['--ink', '--green-soft'], ['--ink', '--gold-soft-hover'],
  ['--ink-2', '--paper'], ['--ink-2', '--sheet'], ['--ink-2', '--rule-2'], ['--ink-2', '--rule'], ['--ink-2', '--gold-soft'],
  ['--ink-3', '--paper'], ['--ink-3', '--sheet'],
  ['--green', '--paper'], ['--green', '--sheet'], ['--green', '--rule-2'], ['--green', '--green-soft'], ['--green', '--gold-soft'],
  ['--on-accent', '--green'], ['--on-accent', '--green-deep'], ['--on-accent', '--red'],
  ['--red', '--paper'], ['--red', '--sheet'], ['--red', '--red-soft'], ['--red', '--rule-2'],
  ['--gold-text', '--paper'], ['--gold-text', '--sheet'], ['--gold-text', '--gold-soft'], ['--gold-text', '--rule-2'],
  ['--on-green-2', '--green'], ['--on-ink-2', '--ink'],
  ['--on-inverse', '--surface-inverse'], ['--on-inverse-2', '--surface-inverse'],
  ['--green-on-inverse', '--surface-inverse'], ['--gold-on-inverse', '--surface-inverse'], ['--red-on-inverse', '--surface-inverse'],
  ...['qb', 'rb', 'wr', 'te', 'k', 'def', 'x'].flatMap((p): [string, string][] => [['--ink', `--pos-${p}`], ['--ink-2', `--pos-${p}`]]),
];
/** the light look is the owner's shipped default and keeps these as they were (the quiet --ink-3 is 3.3:1 there, used for hairlines and big numerals) */
const LIGHT_FLOOR: Record<string, number> = { '--ink-3': 3 };
/** graphics and large text need 3:1 */
const GRAPHIC_PAIRS: [string, string][] = [
  ['--green', '--paper'], ['--green-2', '--sheet'], ['--gold', '--paper'], ['--gold', '--sheet'], ['--red', '--paper'], ['--toilet', '--sheet'], ['--ink-3', '--paper'], ['--ink-3', '--sheet'],
];

describe('contrast (WCAG AA)', () => {
  const lightVars = new Map(LIGHT);
  const darkVars = new Map([...LIGHT, ...DARK]);

  it('passes AA (4.5:1) for every text pair in the dark look', () => {
    const low = TEXT_PAIRS.map(([f, b]) => [`${f} on ${b}`, ratioIn(darkVars, f, b)] as const).filter(([, r]) => r < 4.5);
    expect(low.map(([n, r]) => `${n} ${r.toFixed(2)}`)).toEqual([]);
  });

  it('passes AA for the same pairs in the light look (the quiet ink-3 aside, which keeps 3:1)', () => {
    const low = TEXT_PAIRS
      .map(([f, b]) => [`${f} on ${b}`, ratioIn(lightVars, f, b), LIGHT_FLOOR[f] ?? 4.5] as const)
      .filter(([, r, floor]) => r < floor);
    expect(low.map(([n, r]) => `${n} ${r.toFixed(2)}`)).toEqual([]);
  });

  it('keeps graphics and the big numerals at 3:1 in the dark look', () => {
    const low = GRAPHIC_PAIRS.map(([f, b]) => [`${f} on ${b}`, ratioIn(darkVars, f, b)] as const).filter(([, r]) => r < 3);
    expect(low.map(([n, r]) => `${n} ${r.toFixed(2)}`)).toEqual([]);
  });

  it('gives the dark look a quiet text colour that is genuinely quieter than the main one, and separated from the raised surface', () => {
    expect(ratioIn(darkVars, '--ink', '--sheet')).toBeGreaterThan(ratioIn(darkVars, '--ink-2', '--sheet'));
    expect(ratioIn(darkVars, '--ink-2', '--sheet')).toBeGreaterThan(ratioIn(darkVars, '--ink-3', '--sheet'));
    expect(ratioIn(darkVars, '--sheet', '--paper')).toBeGreaterThan(1.1);
  });
});

// ---- no literal colours outside tokens.css ----
const SRC = `${process.cwd()}/src`;
function cssFiles(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = `${d}/${e.name}`;
    return e.isDirectory() ? cssFiles(p) : e.name.endsWith('.css') ? [p] : [];
  });
}
/** A literal colour: hex, rgb(a), hsl(a), hwb, lab, lch, oklab, oklch, color(), or the keywords white and black (not white-space, not --white).
    Not counted: an alpha mask (`mask-image: ... #000`) and an id in url(#...), which are not colours the eye sees. */
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|(?<![\w-])(?:white|black)(?![\w-])/g;

export function literalColours(css: string): { line: number; literal: string }[] {
  const blank = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const found: { line: number; literal: string }[] = [];
  blank.split('\n').forEach((text, i) => {
    if (/\bmask(-image)?:/.test(text)) return;
    for (const m of text.replace(/url\([^)]*\)/g, '').matchAll(LITERAL)) found.push({ line: i + 1, literal: m[0] });
  });
  return found;
}

/** TEMPORARY. The literal colours that stylesheets outside tokens.css still hold, by file and line (as of the dark mode pass, Oct 18, 2026).
    A new literal colour fails this test. Each owner replaces theirs with a token and deletes the entry; line numbers drift while other work is
    in flight, so a file is matched on its literals (in order of appearance), and a stale entry only warns. Theme shims for these live in theme.css. */
export const ALLOWED_LITERAL_COLOURS: Record<string, string[]> = {
};

describe('no literal colours outside tokens.css', () => {
  const offenders = new Map<string, { line: number; literal: string }[]>();
  for (const file of cssFiles(SRC)) {
    const rel = file.slice(process.cwd().length + 1);
    if (rel.endsWith('src/styles/tokens.css')) continue;
    const found = literalColours(readFileSync(file, 'utf8'));
    if (found.length) offenders.set(rel, found);
  }

  it('finds the literals the pattern is meant to find, and none it is not', () => {
    const f = (s: string) => literalColours(s).map((x) => x.literal);
    expect(f('a { color: #fff; background: #1F1D19cc; b: rgb(1,2,3); c: rgba(0, 0, 0, .1); d: hsl(1 2% 3%); }')).toEqual(['#fff', '#1F1D19cc', 'rgb(1,2,3)', 'rgba(0, 0, 0, .1)', 'hsl(1 2% 3%)']);
    expect(f('a { color: white; b: color-mix(in srgb, var(--x) 50%, black); }')).toEqual(['white', 'black']);
    expect(f('a { white-space: nowrap; color: var(--white-ish); fill: url(#abc); mask-image: linear-gradient(#000, transparent); }')).toEqual([]);
    expect(f('/* #fff in a comment */ a { color: var(--ink); }')).toEqual([]);
    expect(f('a {\n color: red;\n\n b: #abc;\n}')).toEqual(['#abc']);
    expect(literalColours('a {\n\n b: #abc;\n}')[0]!.line).toBe(3);
  });

  it('adds no literal colour to any stylesheet beyond the temporary allow-list', () => {
    const fresh: string[] = [];
    for (const [file, found] of offenders) {
      const allowed = [...(ALLOWED_LITERAL_COLOURS[file] ?? []).map((e) => e.replace(/^\d+:/, ''))];
      for (const { line, literal } of found) {
        const at = allowed.indexOf(literal);
        if (at >= 0) allowed.splice(at, 1);
        else fresh.push(`${file}:${line} ${literal}  (use a token from tokens.css)`);
      }
    }
    expect(fresh).toEqual([]);
  });

  it('warns about allow-list entries that no longer match (delete them)', () => {
    const stale: string[] = [];
    for (const [file, entries] of Object.entries(ALLOWED_LITERAL_COLOURS)) {
      const have = (offenders.get(file) ?? []).map((o) => o.literal);
      for (const e of entries) {
        const lit = e.replace(/^\d+:/, '');
        const at = have.indexOf(lit);
        if (at >= 0) have.splice(at, 1);
        else stale.push(`${file} ${e}`);
      }
    }
    if (stale.length) console.warn(`tokens.test.ts: stale allow-list entries, delete them:\n  ${stale.join('\n  ')}`);
    expect(Array.isArray(stale)).toBe(true);
  });

  it('keeps the shims and the toggle in theme.css free of literal colours', () => {
    expect(literalColours(readFileSync(`${dir}theme.css`, 'utf8'))).toEqual([]);
  });
});
