/* The browser half of a card: measuring text with the real fonts, and drawing the SVG to a canvas to get a PNG.
   Everything in the SVG is a data: URL (the font and the headshots), so the canvas is never tainted and toBlob always works. */
import { cssFont } from '../../engine/share';
import type { FontSpec, Measure } from '../../engine/share';

/** A text measurer on a canvas, using whatever fonts the page has loaded. Falls back to null where there is no canvas (jsdom). */
export function canvasMeasure(): Measure | null {
  if (typeof document === 'undefined') return null;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  const g = ctx;
  return (text: string, f: FontSpec) => {
    g.font = cssFont(f);
    return g.measureText(text).width + (f.spacing ?? 0) * text.length;
  };
}

export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('the card image could not be drawn'));
    img.decoding = 'sync';
    img.src = src;
  });
}

const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Rasterise an SVG string at `scale` times its size and return the PNG. The image is drawn twice with a short pause between: Safari
    decodes an SVG image's embedded font on the first draw and only has it ready on the second. */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const img = await loadImage(svgDataUrl(svg));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('this browser cannot draw the card');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  await tick(60);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the card could not be saved as an image'))), 'image/png');
  });
}
