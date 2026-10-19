/* The PNGs scripts/make-icons.ts renders (and src/app/pwa/manifest.test.ts checks), kept apart so a test can read the list without starting a browser. */

/** Each PNG: which drawing, and the square size in px. The apple-touch icon uses the full-bleed drawing: iOS rounds the corners itself and
    paints transparent pixels black. */
export const ICONS: ReadonlyArray<{ file: string; svg: string; size: number }> = [
  { file: 'apple-touch-icon.png', svg: 'icon-maskable.svg', size: 180 },
  { file: 'icon-192.png', svg: 'icon.svg', size: 192 },
  { file: 'icon-512.png', svg: 'icon.svg', size: 512 },
  { file: 'icon-maskable-512.png', svg: 'icon-maskable.svg', size: 512 },
];

