/* The hot take card: the headline big, the player on his team colour, the stat line, and how this kind of take did last season. */
import { avatar, CW, FOOT_Y, lc, M, paragraph, text, wrap, type Ctx } from '../kit.ts';
import type { TakeCardData } from '../types.ts';

export function takeBody(c: Ctx, d: TakeCardData): string {
  const { pal } = c;
  const toneColor = d.tone === 'good' ? pal.green : d.tone === 'bad' ? pal.red : pal.goldInk;
  // the headline: the largest size that fits in four lines without a cut
  const sizes = [112, 100, 92, 84, 76, 68];
  let size = sizes[sizes.length - 1]!;
  for (const sz of sizes) {
    const p = wrap(lc(d.headline), { family: 'serif', size: sz }, CW, 4, c.measure);
    if (p.every((l) => !l.endsWith('…')) && p.length <= (sz >= 100 ? 3 : 4)) { size = sz; break; }
  }
  const lineH = Math.round(size * 1.04);
  const head = paragraph(M, 134 + size * 0.98, lc(d.headline), { family: 'serif', size }, CW, 4, lineH, c, { fill: pal.ink });

  // everything below flows with an even gap
  const r = 96;
  const stat = wrap(d.statLine, { family: 'sans', size: 32 }, CW - 80, 5, c.measure);
  const boxH = 44 + 56 + stat.length * 46 + 14;
  const tr = d.trackRecord ? wrap(d.trackRecord, { family: 'serif', size: 34, italic: true }, CW, 2, c.measure) : [];
  const trH = tr.length ? 44 + tr.length * 42 : 0;
  const headH = head.bottom - 134;
  const sections = [headH, r * 2, boxH, ...(trH ? [trH] : [])];
  const free = FOOT_Y - 134 - 36 - sections.reduce((a, b) => a + b, 0);
  const gap = Math.max(28, Math.min(100, free / sections.length));
  let y = 134 + headH + gap * 0.9;

  let out = head.svg;
  out += avatar(c, d.player, M + r, y + r, r);
  const nx = M + r * 2 + 36;
  const nameMax = CW - (nx - M);
  const nm = paragraph(nx, y + 78, lc(d.player.name), { family: 'serif', size: 62 }, nameMax, 2, 66, c, { fill: pal.ink });
  out += nm.svg;
  const by = nm.bottom - 66 + 50;
  out += text(nx, by, lc(`${d.player.pos ?? ''}${d.player.team ? ` · ${d.player.team}` : ''} · week ${d.week}`), { family: 'sans', size: 28 }, { fill: pal.ink3 });
  out += `<circle cx="${nx + 9}" cy="${by + 39}" r="9" fill="${toneColor}"/>`
    + text(nx + 28, by + 48, lc(`${d.toneLabel} · ${d.kindLabel}`), { family: 'sans', size: 26, weight: 600 }, { fill: toneColor });
  y += r * 2 + gap;

  // the numbers
  out += `<rect x="${M}" y="${y}" width="${CW}" height="${boxH}" rx="16" fill="${pal.sheet}" stroke="${pal.rule}" stroke-width="2"/>`
    + text(M + 40, y + 46, 'the numbers', { family: 'sans', size: 20, weight: 600, spacing: 1 }, { fill: pal.ink3 })
    + stat.map((l, i) => text(M + 40, y + 44 + 56 + i * 46 - 8, l, { family: 'sans', size: 32 }, { fill: pal.ink })).join('');
  y += boxH + gap;

  if (tr.length) {
    out += text(M, y + 20, 'track record', { family: 'sans', size: 20, weight: 600, spacing: 1 }, { fill: pal.ink3 })
      + tr.map((l, i) => text(M, y + 20 + 52 + i * 42 - 8, l, { family: 'serif', size: 34, italic: true }, { fill: pal.ink2 })).join('');
  }
  return out;
}
