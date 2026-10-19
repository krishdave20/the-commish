/* The draft grade card: the team, the letter grade big, and the best pick and the biggest miss with headshots. */
import { avatar, CW, esc, fitLine, lc, M, paragraph, SERIF, text, type Ctx } from '../kit.ts';
import type { GradeCardData, GradePick } from '../types.ts';

const ordinal = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
};

function pickBlock(c: Ctx, label: string, p: GradePick | null, x: number, y: number, w: number, tone: 'good' | 'bad'): string {
  const { pal } = c;
  const color = tone === 'good' ? pal.green : pal.red;
  let out = text(x, y, label, { family: 'sans', size: 22, weight: 600, spacing: 1 }, { fill: pal.ink3 });
  if (!p) return out + text(x, y + 60, '—', { family: 'serif', size: 44 }, { fill: pal.ink3 });
  const r = 60;
  out += avatar(c, p, x + r, y + 40 + r, r);
  const nx = x + r * 2 + 22;
  const mw = w - (nx - x);
  const nm = paragraph(nx, y + 82, lc(p.name), { family: 'serif', size: 44 }, mw, 2, 46, c, { fill: pal.ink });
  out += nm.svg;
  const base = nm.bottom - 46 + 38;
  out += text(nx, base, fitLine(lc(p.line), { family: 'sans', size: 22 }, mw, c.measure), { family: 'sans', size: 22 }, { fill: pal.ink3 });
  out += text(nx, base + 34, fitLine(lc(p.delta), { family: 'sans', size: 25, weight: 600 }, mw, c.measure), { family: 'sans', size: 25, weight: 600 }, { fill: color });
  return out;
}

export function gradeBody(c: Ctx, d: GradeCardData): string {
  const { pal } = c;
  let out = '';
  const nameF = { family: 'serif' as const, size: 72 };
  out += paragraph(M, 232, lc(d.team), nameF, CW, 1, 76, c, { fill: pal.ink }).svg;
  out += text(M, 282, lc(d.isMe ? `my draft · ${d.season}` : `the draft · ${d.season}`), { family: 'sans', size: 26 }, { fill: pal.ink3 });

  // the big letter (hindsight): the letter large, a + or − as a superscript beside it
  const base = d.hindsight.slice(0, 1);
  const mod = d.hindsight.slice(1);
  const lf = { family: 'serif' as const, size: 560 };
  const mf = { family: 'serif' as const, size: 300 };
  out += `<text x="${M - 12}" y="800" font-family="${SERIF}" font-size="${lf.size}" fill="${pal.ink}">${esc(base)}`
    + (mod ? `<tspan dy="-270" dx="-12" font-size="${mf.size}">${esc(mod)}</tspan>` : '') + '</text>';
  const lw = c.measure(base, lf) - 12 + (mod ? c.measure(mod, mf) + 8 : 0);
  const rx = Math.max(M + lw + 40, 580);
  const rw = M + CW - rx;
  const labelF = { family: 'sans' as const, size: 22, weight: 600, spacing: 1 };
  out += text(rx, 450, 'hindsight', labelF, { fill: pal.ink3 });
  out += text(rx, 520, fitLine(`${ordinal(d.rank)} of ${d.teamCount}`, { family: 'serif', size: 64 }, rw, c.measure), { family: 'serif', size: 64 }, { fill: pal.ink });
  out += `<line x1="${rx}" y1="560" x2="${M + CW}" y2="560" stroke="${pal.rule}" stroke-width="2"/>`;
  out += text(rx, 616, 'draft day', labelF, { fill: pal.ink3 });
  out += text(rx, 684, d.draftDay, { family: 'serif', size: 64 }, { fill: pal.ink });
  out += `<line x1="${rx}" y1="724" x2="${M + CW}" y2="724" stroke="${pal.rule}" stroke-width="2"/>`;
  const moved = d.rankChange === 0 ? 'held its place' : `${d.rankChange > 0 ? 'up' : 'down'} ${Math.abs(d.rankChange)} since draft day`;
  out += text(rx, 776, fitLine(moved, { family: 'sans', size: 26, weight: 600 }, rw, c.measure), { family: 'sans', size: 26, weight: 600 }, { fill: d.rankChange > 0 ? pal.green : d.rankChange < 0 ? pal.red : pal.ink2 });

  // best pick and biggest miss
  out += `<line x1="${M}" y1="880" x2="${M + CW}" y2="880" stroke="${pal.rule}" stroke-width="2"/>`;
  const colW = (CW - 48) / 2;
  out += pickBlock(c, 'best pick', d.best, M, 970, colW, 'good');
  out += pickBlock(c, 'biggest miss', d.miss, M + colW + 48, 970, colW, 'bad');
  return out;
}
