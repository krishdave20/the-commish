/* Builders for the dynasty tests: FantasyCalc entries, pick rows and hand-made team inputs. */
import type { FcEntry } from '../draft/fantasycalc.ts';

export function fcPlayer(pid: string, value: number, position = 'WR', name = pid): FcEntry {
  return { sleeperId: pid, name, position, value, overallRank: 1, positionRank: 1, trend30Day: 0 };
}

export function fcPick(id: string, value: number): FcEntry {
  return { sleeperId: id, name: id, position: 'PICK', value, overallRank: 1, positionRank: 1, trend30Day: 0 };
}

/** FantasyCalc's shape: the next draft (2027) priced by early/mid/late for four rounds, later drafts by round only. */
export function fcPickRows(): Record<string, FcEntry> {
  const out: Record<string, FcEntry> = {};
  const first: Record<number, [number, number, number, number]> = { 1: [4600, 3000, 2300, 2800], 2: [1800, 1500, 1300, 1480], 3: [1180, 1060, 960, 1040], 4: [880, 810, 750, 800] };
  for (const [r, [early, mid, late, plain]] of Object.entries(first)) {
    const n = Number(r);
    out[`FP_2027_early_${n - 1}`] = fcPick(`FP_2027_early_${n - 1}`, early);
    out[`FP_2027_mid_${n - 1}`] = fcPick(`FP_2027_mid_${n - 1}`, mid);
    out[`FP_2027_late_${n - 1}`] = fcPick(`FP_2027_late_${n - 1}`, late);
    out[`FP_2027_${n}`] = fcPick(`FP_2027_${n}`, plain);
  }
  const later: Record<string, number[]> = { 2028: [2000, 1300, 950, 750], 2029: [1800, 1190, 870, 750] };
  for (const [s, vals] of Object.entries(later)) vals.forEach((v, i) => { out[`FP_${s}_${i + 1}`] = fcPick(`FP_${s}_${i + 1}`, v); });
  return out;
}
