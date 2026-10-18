/* Display helpers. Pure functions, no React. */

/** "Fri, Oct 16, 4:05 PM" in the viewer's local time. */
export function formatAsOf(ts: number): string {
  const s = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(ts);
  // newer ICU versions put a narrow no-break space before AM/PM
  return s.replace(/[  ]/g, ' ');
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v.toFixed(0) : v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatMs(n: number): string {
  return `${Math.round(n)} ms`;
}

/** Points in tables and sub-lines: 2 decimals. */
export function formatPoints(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

/** Points in big KPI figures and anything beside them: 1 decimal. */
export function formatPoints1(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

/** A plain figure with fixed decimals, for ADP, ages and ratios (points, money and percents have their own formatters). */
export function formatNum(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

/** Whole dollars with thousands separators: "$1,800". */
export function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Sleeper stores points as whole `fpts` plus hundredths in `fpts_decimal`. */
export function sleeperPoints(whole: number | undefined, decimal: number | undefined): number {
  return (whole ?? 0) + (decimal ?? 0) / 100;
}

/** Win probabilities and odds: "74%", with ">99%" and "<1%" for values just short of the ends. */
export function formatOdds(x: number): string {
  if (x > 0.995 && x < 1) return '>99%';
  if (x < 0.005 && x > 0) return '<1%';
  return `${Math.round(x * 100)}%`;
}

export function formatPct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** "+3", "−2" (true minus sign) or "±0", from a fraction: signedPct(0.031) is "+3". */
export function signedPct(x: number): string {
  return `${x >= 0.005 ? '+' : x <= -0.005 ? '−' : '±'}${Math.round(Math.abs(x) * 100)}`;
}

/** 1 becomes "1st", 12 becomes "12th". */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "+3.2" or "−1.0" (true minus sign), one decimal by default. */
export function signed(n: number, digits = 1): string {
  const r = Number(n.toFixed(digits));
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(digits)}`;
}

/** 12400 becomes "12k", 1500 "1.5k", 800 "800". */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
