export type {
  StandardMatchupsCell, StandardMatchupsClassKey, StandardMatchupsColumn, StandardMatchupsData,
  StandardMatchupsFormat, StandardMatchupsRow,
} from './model/types';
export { createStandardMatchupsClient } from './model/client';
export type { StandardMatchupsState } from './model/state';
export { useStandardMatchups } from './useStandardMatchups';
export {
  confidenceOfRank, MATRIX_MIN_GAMES, standardMatrix,
  type StandardMatchupConfidence, type StandardMatrix, type StandardMatrixArchetype, type StandardMatrixPair,
} from './model/matrix';
