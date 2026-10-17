/* The two helpers every stat formula builds on. A zero (or missing) denominator gives null, never 0 or NaN,
   so "no sample" can never look like "a real zero". */

/** Round half away from zero to `digits` decimals. Shifts the decimal point as text so 2.345 gives 2.35, not 2.34. */
export function round(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  if (String(Math.abs(x)).includes('e')) return Math.round(x * 10 ** digits) / 10 ** digits || 0;
  const shifted = Math.round(Number(`${Math.abs(x)}e${digits}`));
  return Math.sign(x) * Number(`${shifted}e-${digits}`) || 0;
}

/** n / d rounded to `digits`, or null when d is 0, missing or not finite. */
export function ratio(n: number, d: number | null | undefined, digits = 3): number | null {
  if (d === null || d === undefined || !Number.isFinite(d) || d === 0 || !Number.isFinite(n)) return null;
  return round(n / d, digits);
}
