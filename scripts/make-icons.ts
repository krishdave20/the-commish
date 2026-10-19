/* Renders the app icon (public/icon.svg and public/icon-maskable.svg) to the PNG sizes a manifest and iOS need, using the Chromium that
   Playwright already installed (npm run e2e:install). No native image library. Run it after changing either SVG:
     npx tsx scripts/make-icons.ts
   The output is committed (public/icon-*.png); the build does not run this. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { ICONS } from './make-icons-config.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const browser = await chromium.launch();
  try {
    for (const { file, svg, size } of ICONS) {
      const markup = readFileSync(join(root, 'public', svg), 'utf8');
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
      );
      const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      writeFileSync(join(root, 'public', file), png);
      console.log(`public/${file} ${size}x${size} (${png.length} bytes)`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
