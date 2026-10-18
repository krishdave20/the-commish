/* Two views of this week's matchup. Both are self-sufficient (they read the model, the what-if, the live feed and the nflverse files
   themselves), so a page only has to mount them:
     <HeadToHead />  starters, head to head: slot by slot, mirrored, with totals
     <Hinges />      who this week hinges on: win chance at stake per starter, with an opponent toggle */
export { HeadToHead, HeadToHeadTable, HEAD_TO_HEAD_TITLE } from './HeadToHead';
export { pairStarters, slotShare, projectionOf } from './pairing';
export type { Pairing } from './pairing';
export { Hinges, HingesTable, HINGES_TITLE } from './Hinges';
export { useMatchupData } from './useMatchupData';
export type { MatchupData } from './useMatchupData';
