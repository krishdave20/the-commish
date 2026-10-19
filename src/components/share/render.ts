/* Card -> PNG, in the browser: wait for the fonts, fetch the headshots that CORS allows, build the SVG, draw it to a canvas, get a PNG.
   No server and no library: the SVG is a string made from data (src/engine/share) and the canvas is the browser's own. */
import { buildCardSvg, CARD_H, CARD_W, cardFileName } from '../../engine/share';
import type { CardSpec, CardTheme } from '../../engine/share';
import { cardPlayers } from '../../engine/share';
import { canvasMeasure, svgToPng } from './canvas';
import { loadFontCss } from './fonts';
import { loadHeadshots } from './headshots';

/** 1080 x 1350 drawn at 2x: 2160 x 2700, crisp on a phone and still under the 16.7 megapixel canvas limit of iOS. */
export const CARD_SCALE = 2;

export interface RenderedCard {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  /** how many players got a real headshot and how many fell back to a monogram */
  photos: number;
  monograms: number;
}

export interface RenderOptions {
  theme: CardTheme;
  scale?: number;
}

async function fontsReady(): Promise<void> {
  try {
    await document.fonts?.ready;
    await Promise.all([document.fonts?.load('48px "Instrument Serif"'), document.fonts?.load('italic 48px "Instrument Serif"')]);
  } catch {
    /* the card still draws, in the fallback serif */
  }
}

export async function renderCard(spec: CardSpec, opts: RenderOptions): Promise<RenderedCard> {
  const players = cardPlayers(spec);
  const [fontCss, images] = await Promise.all([loadFontCss().catch(() => ''), loadHeadshots(players), fontsReady()]);
  const svg = buildCardSvg(spec, { theme: opts.theme, images, fontCss, measure: canvasMeasure() ?? undefined });
  const scale = opts.scale ?? CARD_SCALE;
  const blob = await svgToPng(svg, CARD_W, CARD_H, scale);
  const real = players.filter((p) => images[p.pid]).length;
  return { blob, fileName: cardFileName(spec), width: Math.round(CARD_W * scale), height: Math.round(CARD_H * scale), photos: real, monograms: players.length - real };
}
