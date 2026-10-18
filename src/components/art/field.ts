/** Field geometry shared by the strip, the win-meter field and the drive chart. A field is 120 yards across: a 10-yard end zone, 100 yards
    of play and a 10-yard end zone. A drive runs left to right, so yard 0 is the left team's goal line and yard 100 the right team's. */
export const FIELD_YARDS = 120;
export const END_ZONE = 10;

/** where a yard (0 to 100 from the left goal line; below 0 or above 100 is inside an end zone) sits, as a percentage of the field's width */
export function fieldPct(yard: number): number {
  return ((END_ZONE + yard) / FIELD_YARDS) * 100;
}

/** a win chance for the left team as the yard the ball sits on: 50% is midfield, 80% the right team's 20 */
export function yardOf(p: number): number {
  const v = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0.5;
  return Math.round(v * 1000) / 10;
}

/** "midfield", "ardmore's 20": the yard in words, read from the left team's side */
export function yardLabel(yard: number, leftName: string, rightName: string): string {
  const y = Math.round(yard);
  if (y === 50) return 'midfield';
  if (y > 50) return `${rightName}’s ${100 - y}`;
  return `${leftName}’s ${y}`;
}

/** the 10-yard lines, goal lines included (yards 0 to 100) */
export const YARD_LINES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** one-yard hash marks in two rows, as a single path on a field `h` units tall (x in yards, 0 to 120) */
export function hashPath(h: number): string {
  const len = h * 0.1;
  const rows = [h * 0.36, h * 0.64];
  let d = '';
  for (let yd = 1; yd < 100; yd++) {
    if (yd % 10 === 0) continue;
    const x = END_ZONE + yd;
    for (const y of rows) d += `M${x} ${(y - len / 2).toFixed(2)}v${len.toFixed(2)}`;
  }
  return d;
}
