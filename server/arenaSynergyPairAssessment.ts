import type { ArenaCombination } from '../shared/arenaSynergyContract.js';
import {
  buildMatchedControlEvidence,
  type ArenaMatchedControlRun,
} from './arenaSynergyMatchedControls.js';

type Classification = NonNullable<ArenaCombination['classification']>;

type PairAssessmentInput = {
  runs: ArenaMatchedControlRun[];
  leftId: string;
  rightId: string;
  cardStrength: ReadonlyMap<string, number>;
  minimumPairRuns: number;
  observedRuns: number;
  adjustedLift: number;
  adjustedInteractionDeltaPoints: number;
};

type PairAssessment = Pick<
  ArenaCombination,
  | 'classification'
  | 'controlledInteractionDeltaPoints'
  | 'matchedControl'
  | 'interactionSignal'
  | 'score'
  | 'confidence'
>;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function arenaPairClassificationRank(classification: Classification): number {
  if (classification === 'confirmed') return 2;
  if (classification === 'promising') return 1;
  return 0;
}

export function buildArenaPairAssessment(input: PairAssessmentInput): PairAssessment {
  const evidence = buildMatchedControlEvidence(
    input.runs,
    input.leftId,
    input.rightId,
    input.cardStrength,
  );
  const controlledDelta = Math.min(
    input.adjustedInteractionDeltaPoints,
    evidence.deltaPoints,
  );
  const isConfirmed = evidence.pairRuns >= 15
    && evidence.controlRuns >= 15
    && evidence.distinctDays >= 3
    && evidence.distinctPlayers >= 5
    && evidence.maxPlayerShare <= 0.35
    && evidence.averageSimilarity >= 0.3
    && controlledDelta >= 0.75
    && input.adjustedInteractionDeltaPoints > 0;
  const isPromising = evidence.pairRuns >= input.minimumPairRuns
    && evidence.controlRuns >= 5
    && evidence.averageSimilarity >= 0.2
    && controlledDelta >= 0.5;
  const classification: Classification = isConfirmed
    ? 'confirmed'
    : isPromising
      ? 'promising'
      : 'popular';
  const supportStrength = 1 - Math.exp(-input.observedRuns / 12);
  const liftStrength = Math.min(1, Math.max(0, Math.log2(input.adjustedLift)));
  const interactionMultiplier = Math.min(1.5, Math.max(0.65, 1 + controlledDelta / 8));
  const matchMultiplier = 0.7 + evidence.averageSimilarity * 0.3;
  const minimumInteractionEvidence = Math.max(10, input.minimumPairRuns);
  const interactionSignal = input.observedRuns < minimumInteractionEvidence
    || evidence.controlRuns < 5
    ? 'insufficient'
    : controlledDelta >= 0.5
      ? 'positive'
      : controlledDelta <= -0.5
        ? 'negative'
        : 'neutral';

  return {
    classification,
    controlledInteractionDeltaPoints: round(controlledDelta, 1),
    matchedControl: {
      pairRuns: evidence.pairRuns,
      controlRuns: evidence.controlRuns,
      pairRunQuality: round(evidence.pairRunQuality, 1),
      controlRunQuality: round(evidence.controlRunQuality, 1),
      deltaPoints: round(evidence.deltaPoints, 1),
      averageSimilarity: round(evidence.averageSimilarity, 2),
      distinctDays: evidence.distinctDays,
      distinctPlayers: evidence.distinctPlayers,
      maxPlayerShare: round(evidence.maxPlayerShare, 2),
    },
    interactionSignal,
    score: Math.min(
      100,
      Math.round(100 * supportStrength * liftStrength * interactionMultiplier * matchMultiplier),
    ),
    confidence: classification === 'confirmed'
      ? 'high'
      : classification === 'promising'
        ? 'medium'
        : 'exploratory',
  };
}
