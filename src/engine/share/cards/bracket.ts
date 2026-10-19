/* The bracket card: the road to the title (or the toilet bowl) left to right with the picks drawn in, and the champion at the end. */
import { CW, fitLine, lc, M, text, wrap, type Ctx } from '../kit.ts';
import type { BracketCardData, BracketCardSlot } from '../types.ts';

const TOP = 478;
const BOTTOM = 1226;

export function bracketHeadline(d: BracketCardData): string {
  if (d.champion) return d.bracketKind === 'toilet' ? `${lc(d.champion)} lost every round` : `${lc(d.champion)} takes it all`;
  return d.bracketKind === 'toilet' ? 'who gets crowned the worst?' : 'who takes it all?';
}

export function bracketBody(c: Ctx, d: BracketCardData): string {
  const { pal } = c;
  const toilet = d.bracketKind === 'toilet';
  const accent = toilet ? pal.toilet : pal.gold;
  let out = '';

  // the champion, big
  out += text(M, 214, lc(d.champion ? d.champLabel : d.title), { family: 'sans', size: 24, weight: 600, spacing: 1.4 }, { fill: accent === pal.gold ? pal.goldInk : pal.toilet });
  const champ = d.champion ? lc(d.champion) : bracketHeadline(d);
  let size = 118;
  while (size > 60 && c.measure(champ, { family: 'serif', size }) > CW) size -= 4;
  out += text(M, 214 + 112, champ, { family: 'serif', size }, { fill: pal.ink });
  const sub = d.champion ? d.champLine : d.picks > 0 ? `my bracket, ${d.picks} pick${d.picks === 1 ? '' : 's'} in` : 'the bracket as it stands';
  out += text(M, 214 + 112 + 54, lc(sub), { family: 'serif', size: 40, italic: true }, { fill: pal.ink2 });
  if (d.picks > 0 && d.champion) out += text(M, 214 + 112 + 100, lc(`built from ${d.picks} pick${d.picks === 1 ? '' : 's'}`), { family: 'sans', size: 24 }, { fill: pal.ink3 });

  // the grid
  const cols = d.rounds + 1;
  const gap = d.rounds >= 4 ? 28 : 36;
  const colW = (CW - gap * (cols - 1)) / cols;
  const colX = (r: number) => M + (r - 1) * (colW + gap);
  const rowH = Math.min(150, (BOTTOM - TOP - 24) / Math.max(1, d.layoutHeight));
  const slotH = Math.min(60, rowH * 0.5 - 3);
  const big = slotH >= 52;
  const top = TOP + 24 + ((BOTTOM - TOP - 24) - rowH * d.layoutHeight) / 2;
  const yOf = (cy: number) => top + cy * rowH;
  const nameF = { family: 'sans' as const, size: colW < 190 ? 21 : big ? 30 : 24, weight: 500 };

  // round headings
  for (let r = 1; r <= d.rounds; r++) {
    out += text(colX(r), TOP + 6, lc(d.roundLabels[r - 1] ?? `round ${r}`), { family: 'sans', size: 20, weight: 600, spacing: 1 }, { fill: pal.ink3 });
  }
  out += text(colX(cols), TOP + 6, lc(toilet ? 'crowned' : 'champion'), { family: 'sans', size: 20, weight: 600, spacing: 1 }, { fill: pal.ink3 });

  // connectors first, so the boxes sit on top
  const byId = new Map(d.matches.map((m) => [m.id, m] as const));
  let lines = '';
  for (const m of d.matches) {
    const to = m.feeds ? byId.get(m.feeds.to) : undefined;
    if (!to || !m.feeds) continue;
    const x1 = colX(m.round) + colW, x2 = colX(to.round);
    const lit = m.a.advances || m.b.advances;
    const slotY = yOf(to.cy) + (m.feeds.slot === 'a' ? -(slotH / 2 + 0.5) : slotH / 2 + 0.5);
    lines += `<path d="M${x1} ${yOf(m.cy)}H${x1 + gap / 2}V${slotY}H${x2}" fill="none" stroke="${lit ? pal.ink2 : pal.rule}" stroke-width="${lit ? 3 : 2}"/>`;
  }
  const fin = d.matches[d.matches.length - 1];
  if (fin) lines += `<path d="M${colX(d.rounds) + colW} ${yOf(fin.cy)}H${colX(cols)}" fill="none" stroke="${d.champion ? pal.ink2 : pal.rule}" stroke-width="${d.champion ? 3 : 2}"/>`;
  out += lines;

  const slot = (s: BracketCardSlot, x: number, y: number, decided: boolean) => {
    const adv = s.advances, out_ = decided && !adv;
    const fill = s.isMe ? pal.goldSoft : pal.sheet;
    const stroke = adv ? pal.ink : pal.rule;
    let g = `<rect x="${x}" y="${y}" width="${colW}" height="${slotH}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${adv ? 2.5 : 1.5}"/>`;
    if (adv) g += `<rect x="${x}" y="${y}" width="7" height="${slotH}" rx="3" fill="${toilet ? pal.toilet : pal.green}"/>`;
    const seedW = big ? 38 : 30;
    if (s.rid !== null) {
      if (s.seed !== null) g += text(x + 16, y + slotH / 2 + 7, String(s.seed), { family: 'sans', size: big ? 22 : 18, weight: 600 }, { fill: pal.ink3 });
      const label = s.bye ? `${lc(s.name)} · bye` : lc(s.name);
      g += text(x + 16 + seedW, y + slotH / 2 + (big ? 10 : 8), fitLine(label, nameF, colW - seedW - 28, c.measure), nameF, { fill: out_ ? pal.ink3 : pal.ink });
    } else {
      g += text(x + 16, y + slotH / 2 + 7, s.bye ? 'bye' : 'to be decided', { family: 'sans', size: 19, italic: true }, { fill: pal.ink3 });
    }
    return g;
  };
  for (const m of d.matches) {
    const x = colX(m.round), cy = yOf(m.cy);
    const decided = m.a.advances || m.b.advances;
    out += `<g data-match="${m.id}">${slot(m.a, x, cy - slotH - 1, decided)}${slot(m.b, x, cy + 1, decided)}</g>`;
  }

  // the champion's box
  if (fin) {
    const cx = colX(cols), cy = yOf(fin.cy), h = 150;
    const edge = d.champion ? (toilet ? pal.toiletEdge : pal.gold) : pal.rule;
    out += `<rect x="${cx}" y="${cy - h / 2}" width="${colW}" height="${h}" rx="12" fill="${d.champion ? (toilet ? pal.redSoft : pal.goldSoft) : pal.sheet}" stroke="${edge}" stroke-width="2.5"/>`;
    const nameSize = colW < 190 ? 30 : 34;
    if (d.champion) {
      const lines = wrap(lc(d.champion), { family: 'serif', size: nameSize }, colW - 24, 3, c.measure);
      lines.forEach((l, i) => { out += text(cx + colW / 2, cy + 12 + (i - (lines.length - 1) / 2) * (nameSize + 2), l, { family: 'serif', size: nameSize }, { fill: pal.ink, anchor: 'middle' }); });
    } else out += text(cx + colW / 2, cy + 7, 'to be decided', { family: 'serif', size: 28, italic: true }, { fill: pal.ink3, anchor: 'middle' });
    out += text(cx + colW / 2, cy - h / 2 + 34, lc(d.champLabel), { family: 'sans', size: 17, weight: 600, spacing: 0.6 }, { fill: toilet ? pal.red : pal.goldInk, anchor: 'middle' });
  }
  return out;
}
