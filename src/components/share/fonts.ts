/* Instrument Serif for the card. The woff2 files are the ones the app already bundles (@fontsource/instrument-serif, SIL OFL); the card
   needs them INSIDE the SVG as data: URLs, because an SVG drawn as an image cannot read the page's fonts. Loaded once, on the first share. */

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(bin)}`;
}

let cached: Promise<string> | null = null;

/** The `@font-face` rules for Instrument Serif regular and italic, with the fonts as data: URLs. */
export function loadFontCss(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      const [normal, italic] = await Promise.all([
        import('@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url'),
        import('@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url'),
      ]);
      const [a, b] = await Promise.all([toDataUrl(normal.default), toDataUrl(italic.default)]);
      const face = (style: string, data: string) => `@font-face{font-family:'Instrument Serif';font-style:${style};font-weight:400;src:url(${data}) format('woff2');}`;
      return face('normal', a) + face('italic', b);
    })();
    // a failure must not stick: the next share tries again
    cached.catch(() => { cached = null; });
  }
  return cached;
}
