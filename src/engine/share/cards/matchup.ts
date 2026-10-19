/* The matchup card: both teams with big scores, the win chance on the turf field, and each side's top performers. */
import { avatar, CW, fitLine, fitSize, lc, M, paragraph, text, turf, yardOf, type Ctx } from '../kit.ts';
import type { MatchupCardData, MatchupSide } from '../types.ts';

const per100 = (v: number) => {
  const n = Math.round(v * 100);
  if (v > 0 && n < 1) return 'fewer than 1';
  if (v < 1 && n > 99) return 'more than 99';
  return String(n);
};
const pct = (v: number) => (v > 0.995 && v < 1 ? '>99%' : v < 0.005 && v > 0 ? '<1%' : `${Math.round(v * 100)}%`);

/** The caption under the field, in words. */
export function winCaption(d: MatchupCardData): string {
  const a = lc(d.a.name), b = lc(d.b.name);
  if (d.state === 'final') return d.winA > 0.5 ? `${a} won` : d.winA < 0.5 ? `${b} won` : 'a tie';
  const fav = d.winA >= 0.5 ? a : b;
  const p = d.winA >= 0.5 ? d.winA : 1 - d.winA;
  return `${fav} wins ${per100(p)} of every 100 simulations ${d.projected ? 'on the projections' : 'from here'}`;
}

const NAME_LINE = 62;

function scoreRow(c: Ctx, s: MatchupSide, y: number, lead: boolean): string {
  const { pal } = c;
  const scoreText = Number.isFinite(s.score) ? s.score.toFixed(1) : '—';
  const scoreF = { family: 'serif' as const, size: 160 };
  const nameMax = CW - c.measure(scoreText, scoreF) - 40;
  const nameF = { family: 'serif' as const, size: 58 };
  const nm = paragraph(M, y + 52, lc(s.name), nameF, nameMax, 2, NAME_LINE, c, { fill: pal.ink });
  let out = nm.svg;
  const lastBase = y + 52 + (nm.lines.length - 1) * NAME_LINE;
  let subY = lastBase + 42;
  if (s.isMe) {
    // a small gold "you" tag after the last line of the name; it drops to its own line when the name leaves no room
    const f = { family: 'sans' as const, size: 22, weight: 600 };
    const w = c.measure('you', f) + 28;
    const lineW = c.measure(nm.lines[nm.lines.length - 1] ?? '', nameF);
    let x = M + lineW + 16, ty = lastBase;
    if (x + w > M + nameMax) { x = M; ty = lastBase + 44; subY = ty + 42; }
    out += `<rect x="${x}" y="${ty - 28}" width="${w}" height="34" rx="17" fill="${pal.goldSoft}" stroke="${pal.gold}" stroke-opacity="0.5"/>`
      + text(x + w / 2, ty - 5, 'you', f, { fill: pal.goldInk, anchor: 'middle' });
  }
  if (s.sub) out += text(M, subY, fitLine(lc(s.sub), { family: 'sans', size: 25 }, nameMax, c.measure), { family: 'sans', size: 25 }, { fill: pal.ink3 });
  out += text(M + CW, y + 118, scoreText, scoreF, { fill: lead ? pal.ink : pal.ink2, anchor: 'end' });
  return out;
}

function performers(c: Ctx, s: MatchupSide, x: number, y: number, w: number): string {
  const { pal } = c;
  const headF = { family: 'sans' as const, size: 22, weight: 600, spacing: 1 };
  let out = text(x, y, fitLine(lc(`${s.name} · top scorers`), headF, w, c.measure), headF, { fill: pal.ink3 });
  const rows = s.performers.slice(0, 2);
  if (rows.length === 0) return out + text(x, y + 56, 'nobody on the board', { family: 'sans', size: 26 }, { fill: pal.ink3 });
  rows.forEach((p, i) => {
    const cy = y + 56 + i * 86;
    const r = 34;
    out += avatar(c, p, x + r, cy, r);
    const pts = p.points.toFixed(1);
    const nameMax = w - r * 2 - 16 - c.measure(pts, { family: 'serif', size: 44 }) - 14;
    const nameF = { family: 'sans' as const, size: 27, weight: 600 };
    out += text(x + r * 2 + 16, cy - 2, fitLine(lc(p.name), nameF, nameMax, c.measure), nameF, { fill: pal.ink });
    out += text(x + r * 2 + 16, cy + 26, lc(`${p.pos ?? ''}${p.team ? ` · ${p.team}` : ''}`), { family: 'sans', size: 22 }, { fill: pal.ink3 });
    out += text(x + w, cy + 14, pts, { family: 'serif', size: 44 }, { fill: pal.ink, anchor: 'end' });
  });
  return out;
}

export function matchupBody(c: Ctx, d: MatchupCardData): string {
  const { pal } = c;
  const diff = d.a.score - d.b.score;
  const aLead = diff !== 0 ? diff > 0 : d.winA >= 0.5;
  // one line as large as it fits (up to 72), else two lines at 54
  const hl = lc(d.headline);
  const oneLine = c.measure(hl, { family: 'serif', size: 60 }) <= CW;
  let out = oneLine
    ? text(M, 232, hl, { family: 'serif', size: fitSize(hl, { family: 'serif', size: 72 }, CW, 60, c.measure) }, { fill: pal.ink })
    : paragraph(M, 218, hl, { family: 'serif', size: 50 }, CW, 2, 54, c, { fill: pal.ink }).svg;

  const y0 = 316;
  out += scoreRow(c, d.a, y0, aLead);
  out += `<line x1="${M}" y1="${y0 + 180}" x2="${M + CW}" y2="${y0 + 180}" stroke="${pal.rule}" stroke-width="2"/>`;
  out += text(M + CW / 2, y0 + 189, 'vs', { family: 'serif', size: 32, italic: true }, { fill: pal.ink3, anchor: 'middle', attrs: `stroke="${pal.paper}" stroke-width="18" stroke-linejoin="round" paint-order="stroke"` });
  out += scoreRow(c, d.b, y0 + 200, !aLead);

  // the win meter on the turf field
  const fy = 770;
  const final = d.state === 'final';
  const yard = final ? (d.winA > 0.5 ? 100 : d.winA < 0.5 ? 0 : 50) : yardOf(d.winA);
  const labelF = { family: 'sans' as const, size: 22, weight: 600, spacing: 1 };
  out += text(M, fy - 80, 'win chance', labelF, { fill: pal.ink3 });
  if (!final) out += text(M + CW, fy - 80, fitLine(lc(`before kickoff ${d.a.name} ${pct(d.preWinA)}`), { family: 'sans', size: 22 }, CW / 2, c.measure), { family: 'sans', size: 22 }, { fill: pal.ink3, anchor: 'end' });
  out += turf(c, { x: M, y: fy, w: CW, h: 150, leftName: d.a.name, rightName: d.b.name, yard, tickYard: final ? null : yardOf(d.preWinA), bubble: final ? 'final' : pct(d.winA) });
  out += paragraph(M, fy + 150 + 50, winCaption(d), { family: 'sans', size: 28 }, CW, 1, 36, c, { fill: pal.ink2 }).svg;

  // top performers
  const colW = (CW - 40) / 2;
  out += performers(c, d.a, M, 1060, colW) + performers(c, d.b, M + colW + 40, 1060, colW);
  return out;
}
