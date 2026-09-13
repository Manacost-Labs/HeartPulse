import {
  ARENA_CLASS_IDS,
  type ArenaClassId,
  type ArenaSynergyPayload,
} from './arenaSynergyContract';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isNumberRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

function isArenaCard(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && (value.cost === null || isFiniteNumber(value.cost))
    && isNullableString(value.type)
    && isNullableString(value.rarity)
    && (value.deckWinRate === null || isFiniteNumber(value.deckWinRate))
    && (value.twelveWinRunQuality === null || isFiniteNumber(value.twelveWinRunQuality))
    && isFiniteNumber(value.runs);
}

function isMatchedControl(value: unknown): boolean {
  return isRecord(value) && [
    value.pairRuns,
    value.controlRuns,
    value.pairRunQuality,
    value.controlRunQuality,
    value.deltaPoints,
    value.averageSimilarity,
    value.distinctDays,
    value.distinctPlayers,
    value.maxPlayerShare,
  ].every(isFiniteNumber);
}

function isArenaCombination(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.cards) || value.cards.length !== 2
    || !value.cards.every(isArenaCard) || !isRecord(value.interactionEvidence)) return false;
  const requiredNumbers = [
    value.observedRuns,
    value.expectedRuns,
    value.supportPercent,
    value.lift,
    value.adjustedLift,
    value.expectedRunQuality,
    value.actualRunQuality,
    value.interactionDeltaPoints,
    value.adjustedInteractionDeltaPoints,
    value.historicalWeight,
    value.score,
    value.forcedPackageShare,
    value.interactionEvidence.cardARuns,
    value.interactionEvidence.cardBRuns,
    value.interactionEvidence.pairRuns,
    value.interactionEvidence.cardAQuality,
    value.interactionEvidence.cardBQuality,
    value.interactionEvidence.classBaselineQuality,
  ];
  return requiredNumbers.every(isFiniteNumber)
    && ['positive', 'neutral', 'negative', 'insufficient'].includes(String(value.interactionSignal))
    && ['high', 'medium', 'exploratory'].includes(String(value.confidence))
    && (value.classification === undefined
      || ['confirmed', 'promising', 'popular'].includes(String(value.classification)))
    && (value.controlledInteractionDeltaPoints === undefined
      || isFiniteNumber(value.controlledInteractionDeltaPoints))
    && (value.matchedControl === undefined || isMatchedControl(value.matchedControl));
}

function isArenaRedraftCard(value: unknown): boolean {
  return isRecord(value)
    && isArenaCard(value.card)
    && [
      value.addedCopies,
      value.addedRuns,
      value.discardedCopies,
      value.discardedRuns,
      value.decisions,
      value.addShare,
      value.netCopies,
    ].every(isFiniteNumber);
}

function isArenaDataQuality(value: unknown): boolean {
  return isRecord(value)
    && (value.status === 'healthy' || value.status === 'warning' || value.status === 'blocked')
    && isFiniteNumber(value.score)
    && isRecord(value.metrics)
    && Array.isArray(value.checks)
    && value.checks.every(check => (
      isRecord(check)
      && typeof check.id === 'string'
      && typeof check.label === 'string'
      && typeof check.message === 'string'
      && typeof check.threshold === 'string'
      && (check.status === 'pass' || check.status === 'warning' || check.status === 'fail')
    ));
}

function isArenaReliability(value: unknown): boolean {
  return isRecord(value)
    && ['stable', 'warming', 'insufficient', 'last-known-good'].includes(String(value.sampleMode))
    && (value.servedFrom === 'live' || value.servedFrom === 'last-known-good')
    && [value.currentWeight, value.historicalWeight, value.stableAtRuns].every(isFiniteNumber)
    && isNullableString(value.previousCohortId)
    && isStringArray(value.limitations);
}

function isArenaHistoryEntry(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.poolFingerprint !== 'string'
    || !isNullableString(value.patchVersion) || !isNullableString(value.from)
    || !isNullableString(value.to) || typeof value.generatedAt !== 'string'
    || !isFiniteNumber(value.runsAnalyzed)) return false;
  if (value.topCombination === null) return true;
  return isRecord(value.topCombination)
    && Array.isArray(value.topCombination.cards)
    && value.topCombination.cards.length === 2
    && value.topCombination.cards.every(card => typeof card === 'string')
    && isFiniteNumber(value.topCombination.interactionDeltaPoints);
}

function isArenaDraftAdvisor(value: unknown): boolean {
  return isRecord(value)
    && Array.isArray(value.cards) && value.cards.every(isArenaCard)
    && Array.isArray(value.targetCurve) && value.targetCurve.every(bucket => (
      isRecord(bucket)
      && typeof bucket.id === 'string'
      && typeof bucket.label === 'string'
      && [bucket.minimumCost, bucket.targetShare, bucket.targetCount].every(isFiniteNumber)
      && (bucket.maximumCost === null || isFiniteNumber(bucket.maximumCost))
    ))
    && isFiniteNumber(value.deckSize)
    && isFiniteNumber(value.minimumRuns)
    && isFiniteNumber(value.pairCoverage)
    && isStringArray(value.limitations)
    && (value.copyProfiles === undefined || (
      Array.isArray(value.copyProfiles) && value.copyProfiles.every(profile => (
        isRecord(profile)
        && typeof profile.cardId === 'string'
        && [
          profile.averageCopiesWhenPresent,
          profile.multiCopyShare,
          profile.maxObservedCopies,
        ].every(isFiniteNumber)
      ))
    ));
}

export function isArenaSynergyPayload(value: unknown): value is ArenaSynergyPayload {
  if (!isRecord(value)) return false;
  const payload = value;
  return payload.schemaVersion === 2
    && typeof payload.generatedAt === 'string'
    && typeof payload.selectedClass === 'string'
    && ARENA_CLASS_IDS.includes(payload.selectedClass as ArenaClassId)
    && isRecord(payload.source)
    && isNullableString(payload.source.winningDecksFetchedAt)
    && isNullableString(payload.source.cardStatsFetchedAt)
    && isRecord(payload.cohort) && typeof payload.cohort.id === 'string'
    && typeof payload.cohort.poolFingerprint === 'string'
    && isNullableString(payload.cohort.patchVersion)
    && isNullableString(payload.cohort.patchPublishedAt)
    && isNullableString(payload.cohort.from)
    && isNullableString(payload.cohort.to)
    && isRecord(payload.summary) && isFiniteNumber(payload.summary.runsAnalyzed)
    && isFiniteNumber(payload.summary.runsAvailable)
    && isFiniteNumber(payload.summary.redraftRuns)
    && isNumberRecord(payload.summary.recordCounts)
    && isStringArray(payload.summary.warnings)
    && isRecord(payload.methodology) && typeof payload.methodology.note === 'string'
    && isFiniteNumber(payload.methodology.minimumPairRuns)
    && isFiniteNumber(payload.methodology.minimumLift)
    && isArenaDataQuality(payload.dataQuality)
    && isArenaReliability(payload.reliability)
    && Array.isArray(payload.availableClasses)
    && payload.availableClasses.every(option => (
      isRecord(option) && ARENA_CLASS_IDS.includes(option.id as ArenaClassId)
      && typeof option.label === 'string' && isFiniteNumber(option.runs)
    ))
    && Array.isArray(payload.history) && payload.history.every(isArenaHistoryEntry)
    && Array.isArray(payload.combinations) && payload.combinations.every(isArenaCombination)
    && Array.isArray(payload.redraft) && payload.redraft.every(isArenaRedraftCard)
    && (payload.draftAdvisor === undefined || isArenaDraftAdvisor(payload.draftAdvisor));
}
