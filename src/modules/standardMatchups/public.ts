export type {
  StandardMatchupsAvailable, StandardMatchupsCell, StandardMatchupsClassKey, StandardMatchupsColumn,
  StandardMatchupsData, StandardMatchupsFormat, StandardMatchupsRank, StandardMatchupsRow, StandardMatchupsSlice,
} from './model/types';
export {
  DEFAULT_STANDARD_MATCHUPS_SLICE, STANDARD_MATCHUPS_MIN_GAMES, STANDARD_MATCHUPS_RANKS,
} from './model/types';
export { readStandardMatchupsSlice, writeStandardMatchupsSlice } from './model/slice';
export { createStandardMatchupsClient } from './model/client';
export type { StandardMatchupsState } from './model/state';
export { useStandardMatchups } from './useStandardMatchups';
export {
  CONFIDENCE_GAMES, confidenceOfRank, gamesConfidence, matchupMinSample, MATRIX_MIN_GAMES, standardMatrix,
  type StandardMatchupConfidence, type StandardMatrix, type StandardMatrixArchetype, type StandardMatrixPair,
} from './model/matrix';
export {
  MATCHUP_GROUP_FLOORS, matchupArchetypeSlug, standardMatchupArchetypes, standardMatchupOverview,
  type StandardMatchupArchetype, type StandardMatchupClassAverage, type StandardMatchupGroup,
  type StandardMatchupOpponent, type StandardMatchupOverview,
} from './model/overview';
