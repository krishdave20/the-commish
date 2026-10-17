/* Playoff brackets: construction, Sleeper's rows, seeding, head-to-head odds and title / flush odds. Pure. */
export * from './types.ts';
export { bracketOrder, buildBracket, roundsFor, roundWeeks, type BuildOpts } from './template.ts';
export {
  advancerOf, outOf, championOf, compile, prunePicks, realBetween, resolveBracket, roundPairs, type Compiled,
} from './resolve.ts';
export {
  advanceProb, matchupOf, oddsFor, oddsWith, outscoreProb, placeByRound, playOnce, playRounds, roundMean, roundSd, scoringFor,
  simulateConsolation, simulatePlayoffs, simulateToiletBowl, weekMean,
  type FlushOdds, type Matchup, type PlayOnce, type Played, type PlayoffOpts, type Scoring, type TitleOdds,
} from './odds.ts';
export { machineOrder, projectedOrder, rankTeams, splitOrder, standingsOrder, type MachineGame, type ProjectedTeam, type SeedRules, type SeedTeam } from './seeding.ts';
export { bracketFromSleeper, losersModeOf, realGamesOf, type FromSleeperOpts } from './sleeper.ts';
export { createPlayoffPass, type PlayoffPass, type PlayoffPassInput, type PlayoffTeamResult } from './season.ts';
export { rulesFromLeagueSettings, rulesOf, type LeagueSettingsLike } from './rules.ts';
export { normal } from './prng.ts';
