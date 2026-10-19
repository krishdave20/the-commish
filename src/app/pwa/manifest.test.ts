/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ICONS } from '../../../scripts/make-icons-config';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(`${root}/public/manifest.webmanifest`, 'utf8')) as {
  id: string; name: string; short_name: string; start_url: string; scope: string; display: string; background_color: string; theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
};

/** width and height from a PNG's IHDR chunk (bytes 16 to 24) */
function pngSize(file: string): { w: number; h: number; sig: boolean } {
  const b = readFileSync(file);
  return { sig: b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('web app manifest', () => {
  it('names the app and starts it in its own window', () => {
    expect(manifest.name).toBe('the commish');
    expect(manifest.short_name).toBe('commish');
    expect(manifest.display).toBe('standalone');
  });

  it('uses relative paths only, so it works under /the-commish/ on GitHub Pages', () => {
    for (const v of [manifest.id, manifest.start_url, manifest.scope, ...manifest.icons.map((i) => i.src)]) {
      expect(v).not.toMatch(/^(\/|[a-z]+:)/i);
    }
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });

  it('takes its colours from the palette (parchment)', () => {
    const tokens = readFileSync(`${root}/src/styles/tokens.css`, 'utf8');
    expect(manifest.background_color).toBe('#f4f1eb');
    expect(manifest.theme_color).toBe('#f4f1eb');
    expect(tokens).toContain('--paper: #f4f1eb');
  });

  it('lists icons that exist, with the sizes they claim, including a maskable one', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    for (const i of manifest.icons) {
      const file = `${root}/public/${i.src}`;
      expect(existsSync(file), i.src).toBe(true);
      if (i.type === 'image/png') {
        const { w, h, sig } = pngSize(file);
        expect(sig, i.src).toBe(true);
        expect(`${w}x${h}`, i.src).toBe(i.sizes);
      }
    }
    const png = manifest.icons.filter((i) => i.type === 'image/png');
    expect(png.some((i) => i.sizes === '192x192' && (i.purpose ?? 'any') === 'any')).toBe(true);
    expect(png.some((i) => i.sizes === '512x512' && (i.purpose ?? 'any') === 'any')).toBe(true);
    expect(png.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  });

  it('has every PNG the icon script makes, at its size, and an apple touch icon of 180', () => {
    for (const { file, size } of ICONS) {
      const { w, h, sig } = pngSize(`${root}/public/${file}`);
      expect([sig, w, h], file).toEqual([true, size, size]);
    }
    expect(pngSize(`${root}/public/apple-touch-icon.png`)).toMatchObject({ w: 180, h: 180 });
  });

  it('draws the icon as SVG too: the maskable one is full bleed with the mark inside the safe zone', () => {
    const mask = readFileSync(`${root}/public/icon-maskable.svg`, 'utf8');
    expect(mask).toContain('viewBox="0 0 512 512"');
    expect(mask).toMatch(/<rect width="512" height="512" fill="#f4f1eb"\/>/);
    expect(readFileSync(`${root}/public/icon.svg`, 'utf8')).toContain('viewBox="0 0 512 512"');
  });
});

describe('index.html', () => {
  const html = readFileSync(`${root}/index.html`, 'utf8');
  it('links the manifest and the iOS home screen pieces', () => {
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
    expect(html).toMatch(/<link rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-status-bar-style"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="the commish"/);
  });
  it('keeps the light and dark theme-color metas', () => {
    expect(html.match(/<meta name="theme-color"/g)).toHaveLength(2);
  });
});
