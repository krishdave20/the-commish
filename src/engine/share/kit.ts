/* Small SVG building blocks shared by every card: escaping, text with measured wrapping, the player circle (headshot or monogram), the turf
   field, the masthead and the footer. Pure string builders: no DOM. All text is lowercased here, because a card is an image and the page's
   `text-transform: lowercase` does not reach it. */
import { initialsOf } from '../../components/avatarUtils.ts';
import { teamColors } from '../nfl/teamColors.ts';
import { paletteFor, type Palette } from './palette.ts';
import { CARD_H, CARD_W, type BuildOptions, type CardPlayer, type CardTheme, type FontSpec, type ImageMap, type Measure } from './types.ts';

export const SERIF = "'Instrument Serif', 'Iowan Old Style', Georgia, 'Times New Roman', serif";
export const SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, sans-serif";

/** page margin and the content width */
export const M = 72;
export const CW = CARD_W - M * 2;
/** where the footer rule sits */
export const FOOT_Y = 1256;

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const lc = (s: string): string => s.toLowerCase();
const num = (n: number): string => String(Math.round(n * 100) / 100);

/** The CSS font shorthand for a spec, used by the canvas measurer. */
export function cssFont(f: FontSpec): string {
  return `${f.italic ? 'italic ' : ''}${f.weight ?? 400} ${f.size}px ${f.family === 'serif' ? SERIF : SANS}`;
}

/** A rough width when no canvas is around (unit tests, a server): Instrument Serif is narrow, the system sans is wider. */
export const estimateMeasure: Measure = (text, f) => {
  const em = f.family === 'serif' ? 0.4 : 0.55;
  let w = 0;
  for (const ch of text) w += /[0-9]/.test(ch) ? 0.5 * (f.family === 'serif' ? 1 : 1.1) : /[ilj.,:;'’|!]/.test(ch) ? em * 0.5 : /[mw]/.test(ch) ? em * 1.45 : em;
  return w * f.size + (f.spacing ?? 0) * text.length;
};

export interface Ctx {
  theme: CardTheme;
  pal: Palette;
  images: ImageMap;
  measure: Measure;
  fontCss: string;
  /** a unique id for a clip path or gradient, per card */
  uid: (prefix: string) => string;
}

export function makeCtx(o: BuildOptions): Ctx {
  let n = 0;
  return {
    theme: o.theme, pal: paletteFor(o.theme), images: o.images ?? {}, measure: o.measure ?? estimateMeasure, fontCss: o.fontCss ?? '',
    uid: (p) => `${p}${++n}`,
  };
}

/* ---------- text ---------- */

export interface TextOpts {
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  opacity?: number;
  /** extra attributes, already escaped */
  attrs?: string;
}

export function text(x: number, y: number, s: string, f: FontSpec, o: TextOpts & { fill: string }): string {
  const fam = f.family === 'serif' ? SERIF : SANS;
  const nums = ' style="font-variant-numeric:tabular-nums"';
  return `<text x="${num(x)}" y="${num(y)}" font-family="${fam}" font-size="${f.size}" font-weight="${f.weight ?? 400}"${f.italic ? ' font-style="italic"' : ''}`
    + `${f.spacing ? ` letter-spacing="${f.spacing}"` : ''} fill="${o.fill}"${o.anchor && o.anchor !== 'start' ? ` text-anchor="${o.anchor}"` : ''}`
    + `${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}${nums}${o.attrs ? ` ${o.attrs}` : ''}>${esc(s)}</text>`;
}

/** Cut a line so it fits `maxW`, ending in an ellipsis. */
export function fitLine(s: string, f: FontSpec, maxW: number, measure: Measure): string {
  if (measure(s, f) <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${s.slice(0, mid).trimEnd()}…`, f) <= maxW) lo = mid; else hi = mid - 1;
  }
  return `${s.slice(0, lo).trimEnd()}…`;
}

/** Greedy word wrap into at most `maxLines` lines; the last line ends in an ellipsis when words are left over. */
export function wrap(s: string, f: FontSpec, maxW: number, maxLines: number, measure: Measure): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const w = words[i]!;
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, f) <= maxW || !cur) { cur = next; continue; }
    if (lines.length === maxLines - 1) break;
    lines.push(cur);
    cur = w;
  }
  if (i < words.length) cur = `${cur} ${words.slice(i).join(' ')}`; // leftovers: the last line carries them and is cut below
  if (cur) lines.push(fitLine(cur, f, maxW, measure));
  return lines.map((l) => fitLine(l, f, maxW, measure));
}

/** The largest size between `min` and `max` at which `s` fits on one line. */
export function fitSize(s: string, f: FontSpec, maxW: number, min: number, measure: Measure): number {
  for (let size = f.size; size > min; size -= 2) if (measure(s, { ...f, size }) <= maxW) return size;
  return min;
}

/** Wrapped text as one `<text>`-per-line block; returns the svg, the y of the last baseline and the y one line under it. */
export function paragraph(x: number, y: number, s: string, f: FontSpec, maxW: number, maxLines: number, lineH: number, c: Ctx, o: TextOpts & { fill: string }): { svg: string; bottom: number; last: number; lines: string[] } {
  const lines = wrap(s, f, maxW, maxLines, c.measure);
  return { svg: lines.map((l, i) => text(x, y + i * lineH, l, f, o)).join(''), bottom: y + lines.length * lineH, last: y + Math.max(0, lines.length - 1) * lineH, lines };
}

/* ---------- the player circle ---------- */

const isRealPid = (pid: string) => /^\d+$/.test(pid);

/** A headshot on the team's colour with a ring in its second colour, or the team-colour monogram when there is no CORS-safe image.
    Team defenses (pos DEF) never get a photo. */
export function avatar(c: Ctx, p: CardPlayer, cx: number, cy: number, r: number): string {
  const isDef = p.pos === 'DEF';
  const colors = teamColors(isDef ? (p.team ?? p.pid) : p.team);
  const bg = colors?.primary ?? c.pal.rule;
  const ring = colors?.secondary ?? c.pal.rule2;
  const fg = colors?.text ?? c.pal.ink2;
  const ringW = Math.max(2, r * 0.07);
  const img = !isDef && isRealPid(p.pid) ? c.images[p.pid] : undefined;
  const base = `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r - ringW / 2)}" fill="${bg}"/>`;
  const edge = `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r - ringW / 2)}" fill="none" stroke="${ring}" stroke-width="${num(ringW)}"/>`;
  // a very dark circle would vanish on the dark card: a faint light edge outside it
  const halo = c.theme === 'dark' ? `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="none" stroke="rgba(255,248,235,0.12)" stroke-width="1.5"/>` : '';
  if (img) {
    const id = c.uid('clip');
    return `<g data-kind="photo" data-pid="${esc(p.pid)}">${base}<clipPath id="${id}"><circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r - ringW)}"/></clipPath>`
      + `<image href="${img}" x="${num(cx - r)}" y="${num(cy - r)}" width="${num(r * 2)}" height="${num(r * 2)}" preserveAspectRatio="xMidYMin slice" clip-path="url(#${id})"/>${edge}${halo}</g>`;
  }
  const label = lc(isDef ? (p.team ?? p.pid).slice(0, 3) : initialsOf(p.name));
  const size = isDef ? r * 0.62 : r * 0.78;
  return `<g data-kind="monogram" data-pid="${esc(p.pid)}">${base}${edge}${halo}${text(cx, cy + size * 0.36, label, { family: 'sans', size, weight: 600, spacing: isDef ? -0.5 : 0 }, { fill: fg, anchor: 'middle' })}</g>`;
}

/* ---------- the turf field (the win meter) ---------- */

const FIELD_YARDS = 120;
const END_ZONE = 10;
const NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10];

/** a win chance for the left team as the yard the ball sits on: 50% is midfield */
export const yardOf = (p: number): number => Math.round((Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0.5) * 1000) / 10;

/** the x (px) of a yard on a field `w` wide starting at `x0` */
const fieldX = (x0: number, w: number, yard: number) => x0 + ((END_ZONE + yard) / FIELD_YARDS) * w;

export interface TurfOpts {
  x: number; y: number; w: number; h: number;
  leftName: string; rightName: string;
  /** the ball's yard (0 to 100; below 0 or above 100 is an end zone) */
  yard: number;
  /** the gold tick: where it stood before kickoff */
  tickYard?: number | null;
  /** the bubble above the ball */
  bubble: string;
}

/** A turf field with alternating stripes, yard lines, hash marks, yard numbers, a named end zone on each side, a gold tick and a ball. */
export function turf(c: Ctx, o: TurfOpts): string {
  const { pal } = c;
  const { x, y, w, h } = o;
  const clip = c.uid('turf');
  const yd = (n: number) => fieldX(x, w, n);
  const stripes = Array.from({ length: 10 }, (_, i) => `<rect x="${num(yd(i * 10))}" y="${y}" width="${num(w / 12)}" height="${h}" fill="${i % 2 ? pal.turf2 : pal.turf}"/>`).join('');
  const lines = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((n) => `<line x1="${num(yd(n))}" y1="${y}" x2="${num(yd(n))}" y2="${y + h}"/>`).join('')
    + `<line x1="${num(yd(0))}" y1="${y}" x2="${num(yd(0))}" y2="${y + h}"/><line x1="${num(yd(100))}" y1="${y}" x2="${num(yd(100))}" y2="${y + h}"/>`;
  let hash = '';
  for (let n = 1; n < 100; n++) {
    if (n % 10 === 0) continue;
    for (const f of [0.36, 0.64]) hash += `M${num(yd(n))} ${num(y + h * f - h * 0.05)}v${num(h * 0.1)}`;
  }
  const ezW = w / 12;
  const ezText = (name: string, side: 'l' | 'r') => {
    const size = Math.min(24, Math.max(15, ezW * 0.36));
    const label = fitLine(lc(name), { family: 'sans', size, weight: 600 }, h - 22, c.measure);
    const cx = side === 'l' ? x + ezW / 2 : x + w - ezW / 2;
    const rot = side === 'l' ? -90 : 90;
    return text(0, 0, label, { family: 'sans', size, weight: 600 }, { fill: pal.turfOn, anchor: 'middle', attrs: `transform="translate(${num(cx + size * 0.35)} ${num(y + h / 2)}) rotate(${rot})"` });
  };
  const nums = NUMBERS.map((n, i) => text(yd((i + 1) * 10), y + h - 8, String(n), { family: 'sans', size: 16, weight: 500 }, { fill: pal.turfNum, anchor: 'middle' })).join('');
  const ballX = yd(o.yard);
  const tick = o.tickYard === null || o.tickYard === undefined ? '' : `<line x1="${num(yd(o.tickYard))}" y1="${y}" x2="${num(yd(o.tickYard))}" y2="${y + h}" stroke="${pal.gold}" stroke-width="3" stroke-dasharray="7 5"/>`
    + `<line x1="${num(Math.min(ballX, yd(o.tickYard)))}" y1="${num(y + h * 0.42)}" x2="${num(Math.max(ballX, yd(o.tickYard)))}" y2="${num(y + h * 0.42)}" stroke="${pal.turfLine}" stroke-width="3" stroke-linecap="round"/>`;
  const bw = 58;
  const ball = `<g transform="translate(${num(ballX)} ${num(y + h * 0.42)}) rotate(-14) scale(${num(bw / 48)})"><path d="M-20.5 0C-13 -13.5 13 -13.5 20.5 0C13 13.5 -13 13.5 -20.5 0Z" fill="${pal.turfBall}" stroke="${pal.turfBallLine}" stroke-width="2.4"/>`
    + `<path d="M-14 -5.4Q-15.4 0 -14 5.4M14 -5.4Q15.4 0 14 5.4" fill="none" stroke="${pal.turfNum}" stroke-width="2" stroke-linecap="round"/>`
    + `<path d="M-7.5 0H7.5M-4.5 -2.8V2.8M0 -3.2V3.2M4.5 -2.8V2.8" fill="none" stroke="${pal.turfNum}" stroke-width="2" stroke-linecap="round"/></g>`;
  // keep the bubble inside the field
  const bubW = Math.max(84, c.measure(o.bubble, { family: 'serif', size: 40 }) + 32);
  const bubX = Math.max(x + bubW / 2, Math.min(x + w - bubW / 2, ballX));
  const bubble = `<g><rect x="${num(bubX - bubW / 2)}" y="${num(y - 62)}" width="${num(bubW)}" height="48" rx="12" fill="${pal.ink}"/>`
    + `<path d="M${num(ballX - 9)} ${num(y - 14)}L${num(ballX)} ${num(y - 2)}L${num(ballX + 9)} ${num(y - 14)}Z" fill="${pal.ink}"/>`
    + text(bubX, y - 26, o.bubble, { family: 'serif', size: 40 }, { fill: pal.paper, anchor: 'middle' }) + '</g>';
  return `<g data-part="turf"><clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/></clipPath>`
    + `<g clip-path="url(#${clip})">${stripes}`
    + `<rect x="${x}" y="${y}" width="${num(ezW)}" height="${h}" fill="${pal.inverse}"/><rect x="${num(x + w - ezW)}" y="${y}" width="${num(ezW)}" height="${h}" fill="${pal.turfEzRed}"/>`
    + `<g stroke="${pal.turfLine}" stroke-width="2">${lines}</g><path d="${hash}" stroke="${pal.turfLine}" stroke-width="1.5" opacity="0.55" fill="none"/>`
    + `${ezText(o.leftName, 'l')}${ezText(o.rightName, 'r')}${nums}${tick}${ball}</g>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="none" stroke="${pal.turfEdge}" stroke-width="2"/>${bubble}</g>`;
}

/* ---------- the frame: background, masthead, footer ---------- */

export interface Frame {
  /** the small line at the top left: "week 7 · matchup" */
  kicker: string;
  /** a chip at the top right, or null */
  chip?: { label: string; tone: 'green' | 'gold' | 'red' | 'ink' } | null;
  /** the line at the bottom right */
  foot: string;
}

function chip(c: Ctx, label: string, tone: 'green' | 'gold' | 'red' | 'ink', xRight: number, y: number): string {
  const { pal } = c;
  const f: FontSpec = { family: 'sans', size: 24, weight: 600, spacing: 0.4 };
  const l = lc(label);
  const w = c.measure(l, f) + 40;
  const [bg, fg, bd] = tone === 'green' ? [pal.greenSoft, pal.green, pal.green] : tone === 'gold' ? [pal.goldSoft, pal.goldInk, pal.gold] : tone === 'red' ? [pal.redSoft, pal.red, pal.red] : ['none', pal.ink2, pal.rule];
  return `<g data-part="chip"><rect x="${num(xRight - w)}" y="${y - 30}" width="${num(w)}" height="46" rx="23" fill="${bg}" stroke="${bd}" stroke-opacity="${tone === 'ink' ? 1 : 0.45}" stroke-width="1.5"/>`
    + text(xRight - w / 2, y + 2, l, f, { fill: fg, anchor: 'middle' }) + '</g>';
}

/** The tiny football beside the wordmark (the same drawing as src/components/art/Football). */
function miniBall(c: Ctx, x: number, y: number, s: number): string {
  return `<g transform="translate(${num(x)} ${num(y)}) scale(${num(s)})" fill="none" stroke="${c.pal.ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">`
    + `<path d="M3.5 16C11 2.5 37 2.5 44.5 16C37 29.5 11 29.5 3.5 16Z" fill="${c.pal.sheet}"/><path d="M10 10.6Q8.6 16 10 21.4M38 10.6Q39.4 16 38 21.4" stroke="${c.pal.gold}"/>`
    + '<path d="M16.5 16H31.5M19.5 13.2V18.8M24 12.8V19.2M28.5 13.2V18.8"/></g>';
}

/** Wrap card content in the svg element, the paper background, the masthead and the footer wordmark. No URL, no tracking. */
export function frame(c: Ctx, kind: string, f: Frame, body: string): string {
  const { pal } = c;
  const font = c.fontCss ? `<defs><style>${c.fontCss}</style></defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" data-card="${kind}" data-theme="${c.theme}" role="img">${font}`
    + `<rect width="${CARD_W}" height="${CARD_H}" fill="${pal.paper}"/>`
    + text(M, 108, lc(f.kicker), { family: 'sans', size: 26, weight: 600, spacing: 1.6 }, { fill: pal.ink3 })
    + (f.chip ? chip(c, f.chip.label, f.chip.tone, CARD_W - M, 108) : '')
    + `<line x1="${M}" y1="134" x2="${CARD_W - M}" y2="134" stroke="${pal.ink}" stroke-width="2"/>`
    + body
    + `<line x1="${M}" y1="${FOOT_Y}" x2="${CARD_W - M}" y2="${FOOT_Y}" stroke="${pal.rule}" stroke-width="2"/>`
    + miniBall(c, M, 1281, 0.8)
    + text(M + 50, 1310, 'the commish', { family: 'serif', size: 46, italic: true }, { fill: pal.ink })
    + text(CARD_W - M, 1308, lc(f.foot), { family: 'sans', size: 24 }, { fill: pal.ink3, anchor: 'end' })
    + '</svg>';
}
