export type ArenaMatchedControlRun = {
  id: string;
  className: string;
  playedAt: string;
  playedAtMs: number;
  playerKey: string;
  runQuality: number;
  cards: Array<{
    id: string;
    cost: number | null;
    count: number;
  }>;
};

export type ArenaMatchedControlEvidence = {
  pairRuns: number;
  controlRuns: number;
  pairRunQuality: number;
  controlRunQuality: number;
  deltaPoints: number;
  averageSimilarity: number;
  distinctDays: number;
  distinctPlayers: number;
  maxPlayerShare: number;
};

type DeckProfile = {
  cardWeights: Map<string, number>;
  curve: number[];
  deckSize: number;
  strength: number | null;
  playedAtMs: number;
};

const PAIR_PRIOR_RUNS = 4;
const CONTROL_PRIOR_RUNS = 8;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cardIdsWithoutPair(run: ArenaMatchedControlRun, excluded: Set<string>): Set<string> {
  return new Set(run.cards.filter(card => !excluded.has(card.id)).map(card => card.id));
}

function normalizedCurve(run: ArenaMatchedControlRun, excluded: Set<string>): number[] {
  const curve = [0, 0, 0, 0];
  let copies = 0;
  for (const card of run.cards) {
    if (excluded.has(card.id)) continue;
    const count = Math.max(1, card.count);
    const bucket = card.cost == null || card.cost <= 2
      ? 0
      : card.cost <= 4
        ? 1
        : card.cost <= 6
          ? 2
          : 3;
    curve[bucket] += count;
    copies += count;
  }
  return copies ? curve.map(value => value / copies) : curve;
}

function deckSizeWithoutPair(run: ArenaMatchedControlRun, excluded: Set<string>): number {
  return run.cards.reduce(
    (total, card) => total + (excluded.has(card.id) ? 0 : Math.max(1, card.count)),
    0,
  );
}

function deckStrength(
  run: ArenaMatchedControlRun,
  excluded: Set<string>,
  cardStrength: ReadonlyMap<string, number>,
): number | null {
  let sum = 0;
  let count = 0;
  for (const card of run.cards) {
    if (excluded.has(card.id)) continue;
    const strength = cardStrength.get(card.id);
    if (strength == null) continue;
    sum += strength * Math.max(1, card.count);
    count += Math.max(1, card.count);
  }
  return count ? sum / count : null;
}

function buildPairProfile(
  pairRuns: ArenaMatchedControlRun[],
  excluded: Set<string>,
  cardStrength: ReadonlyMap<string, number>,
): DeckProfile {
  const cardWeights = new Map<string, number>();
  const curve = [0, 0, 0, 0];
  let deckSize = 0;
  let strengthSum = 0;
  let strengthCount = 0;
  let playedAtMs = 0;

  for (const run of pairRuns) {
    for (const id of cardIdsWithoutPair(run, excluded)) {
      cardWeights.set(id, (cardWeights.get(id) ?? 0) + 1 / pairRuns.length);
    }
    normalizedCurve(run, excluded).forEach((value, index) => {
      curve[index] += value / pairRuns.length;
    });
    deckSize += deckSizeWithoutPair(run, excluded) / pairRuns.length;
    const strength = deckStrength(run, excluded, cardStrength);
    if (strength != null) {
      strengthSum += strength;
      strengthCount += 1;
    }
    playedAtMs += run.playedAtMs / pairRuns.length;
  }

  return {
    cardWeights,
    curve,
    deckSize,
    strength: strengthCount ? strengthSum / strengthCount : null,
    playedAtMs,
  };
}

function weightedCardSimilarity(profile: DeckProfile, controlIds: Set<string>): number {
  let intersection = 0;
  for (const id of controlIds) intersection += profile.cardWeights.get(id) ?? 0;
  const profileWeight = Array.from(profile.cardWeights.values()).reduce((sum, value) => sum + value, 0);
  const union = profileWeight + controlIds.size - intersection;
  return union ? clamp(intersection / union) : 1;
}

function curveSimilarity(left: number[], right: number[]): number {
  const distance = left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0);
  return clamp(1 - distance / 2);
}

function controlSimilarity(
  profile: DeckProfile,
  control: ArenaMatchedControlRun,
  leftId: string,
  rightId: string,
  cardStrength: ReadonlyMap<string, number>,
): number {
  const excluded = new Set([leftId, rightId]);
  const ids = cardIdsWithoutPair(control, excluded);
  const controlCurve = normalizedCurve(control, excluded);
  const controlSize = deckSizeWithoutPair(control, excluded);
  const controlStrength = deckStrength(control, excluded, cardStrength);
  const sizeSimilarity = 1 - clamp(Math.abs(profile.deckSize - controlSize) / Math.max(1, profile.deckSize));
  const strengthSimilarity = profile.strength == null || controlStrength == null
    ? 0.5
    : 1 - clamp(Math.abs(profile.strength - controlStrength) / 15);
  const ageDays = Math.abs(profile.playedAtMs - control.playedAtMs) / 86_400_000;
  const timeSimilarity = Math.exp(-ageDays / 30);
  const controlIds = new Set(control.cards.map(card => card.id));
  const containsExactlyOne = controlIds.has(leftId) !== controlIds.has(rightId);

  return (
    weightedCardSimilarity(profile, ids) * 0.45
    + curveSimilarity(profile.curve, controlCurve) * 0.25
    + sizeSimilarity * 0.1
    + strengthSimilarity * 0.1
    + timeSimilarity * 0.05
    + (containsExactlyOne ? 1 : 0) * 0.05
  );
}

export function buildMatchedControlEvidence(
  runs: ArenaMatchedControlRun[],
  leftId: string,
  rightId: string,
  cardStrength: ReadonlyMap<string, number>,
): ArenaMatchedControlEvidence {
  const pairRuns = runs.filter(run => {
    const ids = new Set(run.cards.map(card => card.id));
    return ids.has(leftId) && ids.has(rightId);
  });
  const selectedControls: Array<{ run: ArenaMatchedControlRun; similarity: number }> = [];
  const classNames = new Set(pairRuns.map(run => run.className));

  for (const className of classNames) {
    const pairClassRuns = pairRuns.filter(run => run.className === className);
    const profile = buildPairProfile(pairClassRuns, new Set([leftId, rightId]), cardStrength);
    const candidates = runs
      .filter(run => {
        if (run.className !== className) return false;
        const ids = new Set(run.cards.map(card => card.id));
        return !(ids.has(leftId) && ids.has(rightId));
      })
      .map(run => ({
        run,
        similarity: controlSimilarity(profile, run, leftId, rightId, cardStrength),
      }))
      .sort((left, right) => right.similarity - left.similarity || left.run.id.localeCompare(right.run.id));
    selectedControls.push(...candidates.slice(0, Math.max(5, pairClassRuns.length * 2)));
  }

  const pairSum = pairRuns.reduce((sum, run) => sum + run.runQuality, 0);
  const controlSum = selectedControls.reduce((sum, item) => sum + item.run.runQuality, 0);
  const totalRuns = pairRuns.length + selectedControls.length;
  const pooledQuality = totalRuns ? (pairSum + controlSum) / totalRuns : 0;
  const pairQuality = pairRuns.length
    ? (pairSum + PAIR_PRIOR_RUNS * pooledQuality) / (pairRuns.length + PAIR_PRIOR_RUNS)
    : 0;
  const controlQuality = selectedControls.length
    ? (controlSum + CONTROL_PRIOR_RUNS * pooledQuality)
      / (selectedControls.length + CONTROL_PRIOR_RUNS)
    : pairQuality;
  const playerCounts = new Map<string, number>();
  for (const run of pairRuns) {
    const player = run.playerKey || 'unknown';
    playerCounts.set(player, (playerCounts.get(player) ?? 0) + 1);
  }

  return {
    pairRuns: pairRuns.length,
    controlRuns: selectedControls.length,
    pairRunQuality: pairQuality * 100,
    controlRunQuality: controlQuality * 100,
    deltaPoints: (pairQuality - controlQuality) * 100,
    averageSimilarity: selectedControls.length
      ? selectedControls.reduce((sum, item) => sum + item.similarity, 0) / selectedControls.length
      : 0,
    distinctDays: new Set(pairRuns.map(run => run.playedAt.slice(0, 10))).size,
    distinctPlayers: new Set(pairRuns.map(run => run.playerKey).filter(Boolean)).size,
    maxPlayerShare: pairRuns.length
      ? Math.max(0, ...Array.from(playerCounts.values(), count => count / pairRuns.length))
      : 0,
  };
}
