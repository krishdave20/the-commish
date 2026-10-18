/* Live win probability for one matchup.

   Pre-game the chance is the engine's own: winProb(a, b, sd), a normal model of the score difference with each team's score
   SD = the league's weekly team SD. Live:
     projection  = the sum of each starter's live projection (actual so far + projected points for the share still to play)
     R_t         = a team's share of starter-minutes remaining = the mean of its starters' remaining shares (1 before kickoff, 0 when done)
     sd_live     = sd × sqrt((R_a + R_b) / 2)
     p           = winProb(projection_a, projection_b, sd_live)
   Variance of what is still to come is proportional to the minutes still to play, so each team's SD shrinks with sqrt(R). The
   difference of two independent scores has variance sd²(R_a + R_b), and winProb takes the per-team SD, hence the average.
   With nothing left (both R = 0) the result is final: 1 for the leader, 0 for the trailer, 0.5 for a tie.
   It rises with the lead (a bigger projection gap never lowers it) and with fewer minutes to play when ahead. */
import { winProb } from '../league.ts';

export function liveSd(sd: number, remA: number, remB: number): number {
  return sd * Math.sqrt(Math.max(0, (remA + remB) / 2));
}

export function liveWinProb(projA: number, projB: number, sd: number, remA: number, remB: number): number {
  if (remA + remB <= 0) return projA > projB ? 1 : projA < projB ? 0 : 0.5;
  return winProb(projA, projB, liveSd(sd, remA, remB));
}
