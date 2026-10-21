export type {
  StandardMatchupsCell, StandardMatchupsClassKey, StandardMatchupsColumn, StandardMatchupsData,
  StandardMatchupsFormat, StandardMatchupsRow,
} from './model/types';
export { createStandardMatchupsClient } from './model/client';
export type { StandardMatchupsState } from './model/state';
export { useStandardMatchups } from './useStandardMatchups';
export {
  confidenceOfRank, matchupMinSample, MATRIX_MIN_GAMES, standardMatrix,
  type StandardMatchupConfidence, type StandardMatrix, type StandardMatrixArchetype, type StandardMatrixPair,
} from './model/matrix';
export {
  MATCHUP_GROUP_FLOORS, matchupArchetypeSlug, standardMatchupArchetypes, standardMatchupOverview,
  type StandardMatchupArchetype, type StandardMatchupClassAverage, type StandardMatchupGroup,
  type StandardMatchupOpponent, type StandardMatchupOverview,
} from './model/overview';
