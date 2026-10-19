/* The huddle card: the sentence that opens the app, in large type, with the odds in words and, when known, the turf field. */
import { avatar, CW, lc, M, paragraph, text, turf, yardOf, type Ctx } from '../kit.ts';
import type { CardPlayer, HuddleCardData } from '../types.ts';

function stack(c: Ctx, ps: CardPlayer[], x: number, y: number, r: number): { svg: string; width: number } {
  const shown = ps.slice(0, 3);
  const step = r * 1.45;
  return { svg: shown.map((p, i) => avatar(c, p, x + r + i * step, y, r)).join(''), width: shown.length ? r * 2 + (shown.length - 1) * step : 0 };
}

export function huddleBody(c: Ctx, d: HuddleCardData): string {
  const { pal } = c;
  // the sentence: the largest size that fits in a few lines and leaves room for the odds and the field
  const hasField = d.winMe !== null && !!d.meName && !!d.oppName;
  const limit = hasField ? 900 : 1020;
  const sizes = [172, 156, 140, 128, 116, 104, 94, 86, 78, 72];
  const txt = lc(d.sentence);
  let para = paragraph(M, 134 + 72, txt, { family: 'serif', size: 72 }, CW, 8, 78, c, { fill: pal.ink });
  for (const size of sizes) {
    const lineH = Math.round(size * 1.05);
    const p = paragraph(M, 134 + size * 0.95, txt, { family: 'serif', size }, CW, 8, lineH, c, { fill: pal.ink });
    para = p;
    if (p.lines.every((l) => !l.endsWith('…')) && p.last <= limit - (d.odds ? 90 : 20)) break;
  }
  let out = para.svg;
  if (d.odds) out += text(M, para.last + 92, lc(d.odds), { family: 'serif', size: 46, italic: true }, { fill: pal.ink2 });
  if (hasField) {
    const fy = 1000;
    out += text(M, fy - 62, 'win chance', { family: 'sans', size: 22, weight: 600, spacing: 1 }, { fill: pal.ink3 });
    const p = d.winMe ?? 0.5;
    out += turf(c, { x: M, y: fy, w: CW, h: 132, leftName: d.meName!, rightName: d.oppName!, yard: yardOf(p), tickYard: null, bubble: `${Math.round(p * 100)}%` });
  }
  if (d.mine.length || d.theirs.length) {
    const ay = hasField ? 1190 : 1120;
    const r = 40;
    const left = stack(c, d.mine, M, ay, r);
    out += left.svg;
    const right = stack(c, d.theirs, M + CW - (d.theirs.length ? r * 2 + (Math.min(3, d.theirs.length) - 1) * r * 1.45 : 0), ay, r);
    out += right.svg;
    if (left.width && right.width) out += text(M + CW / 2, ay + 10, 'vs', { family: 'serif', size: 36, italic: true }, { fill: pal.ink3, anchor: 'middle' });
  }
  return out;
}
