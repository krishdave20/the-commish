import type { Engine } from '../../engine';

/** The one-line magic number for the signed-in team: what it takes to clinch, or that it already has (or is out). */
export function magicLine(engine: Engine): string {
  const { divisions } = engine.model.meta;
  const des = engine.designations()[engine.meRid];
  const wc = engine.winsToClinch();
  if (des?.clinch) return `magic number: 0. you have clinched a playoff spot${des.divClinch ? ' and the division' : ''}.`;
  if (des?.elim) return 'you have been eliminated from the playoffs.';
  let text: string;
  if (wc.spot === null) text = 'no number of your own wins guarantees a spot yet.';
  else if (wc.winOut) text = `magic number: ${wc.spot}. win all ${wc.open} of your remaining games to clinch a spot.`;
  else text = `magic number: ${wc.spot}. win ${wc.spot} of your last ${wc.open} to clinch a spot.`;
  if (divisions > 0 && wc.div !== null) text += ` win ${wc.div} of your last ${wc.open} to clinch the division.`;
  return text;
}
