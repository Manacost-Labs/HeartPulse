import { createHash } from 'node:crypto';
import {
  ARENA_CLASS_IDS,
  ARENA_CLASS_LABELS,
  type ArenaClassId,
  type ArenaCombination,
  type ArenaRedraftCard,
  type ArenaSynergyCard,
  type ArenaSynergyPayload,
} from '../shared/arenaSynergyContract.js';
import {
  assessArenaDataQuality,
  type ArenaNormalizationProfile,
} from './arenaSynergyDataQuality.js';
import {
  arenaPairClassificationRank,
  buildArenaPairAssessment,
} from './arenaSynergyPairAssessment.js';

const SAMPLE_LIMIT = 500;
const MINIMUM_LIFT = 1.25;
const PACKAGE_FILTER_SHARE = 0.5;
const STABLE_SAMPLE_RUNS = 200;
const CARD_QUALITY_PRIOR_RUNS = 12;
const PAIR_QUALITY_PRIOR_RUNS = 4;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

type UnknownRecord = Record<string, unknown>;

type NormalizedCard = {
  id: string;
  name: string;
  cost: number | null;
  type: string | null;
  rarity: string | null;
  count: number;
};

type NormalizedRun = {
  id: string;
  className: ArenaClassId;
  record: string;
  playedAt: string;
  playedAtMs: number;
  playerKey: string;
  runQuality: number;
  cards: NormalizedCard[];
  added: NormalizedCard[];
  discarded: NormalizedCard[];
  packageIds: Set<string>;
};

type CardMeta = Omit<ArenaSynergyCard, 'runs' | 'twelveWinRunQuality'>;

export type ArenaSynergyAnalysisInput = {
  winningDecks: unknown;
  cardStats: unknown;
  patches: unknown;
  className: ArenaClassId;
  previousSnapshot?: ArenaSynergyPreviousSnapshot | null;
  now?: Date;
};

export type ArenaSynergyPreviousSnapshot = {
  savedAt: string;
  activeCardIds: string[];
  payload: ArenaSynergyPayload;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace('%', '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveInteger(value: unknown, fallback = 1): number {
  const parsed = finiteNumber(value);
  return parsed != null && parsed > 0
    ? Math.min(99, Math.max(1, Math.round(parsed)))
    : fallback;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function structuredRoot(value: unknown): UnknownRecord {
  const root = asRecord(value);
  const data = asRecord(root.data);
  return asRecord(data.structured);
}

function normalizeClass(value: unknown): ArenaClassId | null {
  const candidate = text(value).replace(/[\s_-]+/g, '').toUpperCase();
  return ARENA_CLASS_IDS.includes(candidate as ArenaClassId) && candidate !== 'ALL'
    ? candidate as ArenaClassId
    : null;
}

function normalizeCard(value: unknown): NormalizedCard | null {
  const card = asRecord(value);
  const id = text(card.card_id) || text(card.id);
  if (!id || id.length > 80) return null;
  return {
    id,
    name: text(card.name) || id,
    cost: finiteNumber(card.cost),
    type: text(card.type) || null,
    rarity: text(card.rarity) || null,
    count: positiveInteger(card.count),
  };
}

function normalizeCardList(value: unknown): NormalizedCard[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 120)
    .map(normalizeCard)
    .filter((item): item is NormalizedCard => Boolean(item));
}

function normalizeRecord(value: unknown): string {
  const raw = text(value);
  const match = raw.match(/^12\s*[-–]\s*([0-2])$/);
  return match ? `12-${match[1]}` : '';
}

function runQuality(record: string): number {
  const losses = Number(record.split('-')[1] ?? 2);
  return 12 / (12 + Math.min(2, Math.max(0, losses)));
}

function hasImpossibleCardCounts(run: UnknownRecord): boolean {
  for (const key of ['final_deck', 'added', 'discarded', 'package_cards']) {
    const value = run[key];
    if (!Array.isArray(value)) continue;
    if (value.length > 120) return true;
    let totalCopies = 0;
    for (const rawCard of value) {
      const count = finiteNumber(asRecord(rawCard).count) ?? 1;
      if (count <= 0 || count > 10) return true;
      totalCopies += count;
    }
    if (totalCopies > 80) return true;
  }
  return false;
}

function normalizeRuns(
  value: unknown,
  nowMs: number,
): {
  runs: NormalizedRun[];
  schemaValid: boolean;
  sourceRows: number;
  invalidRuns: number;
  futureRuns: number;
  impossibleDecks: number;
} {
  const structured = structuredRoot(value);
  const schemaValid = Array.isArray(structured.decks);
  const rows = schemaValid ? structured.decks as unknown[] : [];
  let invalidRuns = Math.max(0, rows.length - 2_000);
  let futureRuns = 0;
  let impossibleDecks = 0;
  const runs: NormalizedRun[] = [];

  rows.slice(0, 2_000).forEach((row, index) => {
    const run = asRecord(row);
    if (hasImpossibleCardCounts(run)) {
      impossibleDecks += 1;
      invalidRuns += 1;
      return;
    }
    const record = normalizeRecord(run.record);
    const className = normalizeClass(run.main_class) ?? normalizeClass(run.class);
    const playedAt = isoDate(run.played_at);
    const cards = normalizeCardList(run.final_deck);
    if (!record || !className || !playedAt || !cards.length) {
      invalidRuns += 1;
      return;
    }
    const playedAtMs = new Date(playedAt).getTime();
    if (playedAtMs > nowMs + MAX_FUTURE_SKEW_MS) {
      futureRuns += 1;
      invalidRuns += 1;
      return;
    }

    const packageCards = normalizeCardList(run.package_cards);
    const packageIds = new Set(packageCards.map(card => card.id));
    const packageKeyId = text(run.package_key_card_id);
    if (packageKeyId) packageIds.add(packageKeyId);
    const draftId = text(run.draft_id);

    runs.push({
      id: draftId || `${className}:${playedAt}:${index}`,
      className,
      record,
      playedAt,
      playedAtMs,
      playerKey: text(run.player).toLocaleLowerCase('en-US').slice(0, 120),
      runQuality: runQuality(record),
      cards,
      added: normalizeCardList(run.added),
      discarded: normalizeCardList(run.discarded),
      packageIds,
    });
  });

  return {
    runs,
    schemaValid,
    sourceRows: rows.length,
    invalidRuns,
    futureRuns,
    impossibleDecks,
  };
}

function arenaPatchText(patch: UnknownRecord): string {
  const sections = Array.isArray(patch.sections)
    ? patch.sections.map(section => text(asRecord(section).title)).join(' ')
    : '';
  return [
    patch.official_title,
    patch.official_summary,
    patch.title,
    patch.summary,
    sections,
  ].map(text).join(' ');
}

function findLatestArenaPatch(value: unknown): {
  version: string;
  publishedAt: string;
  publishedAtMs: number;
} | null {
  const root = asRecord(value);
  const rows = Array.isArray(root.patches)
    ? root.patches
    : Array.isArray(asRecord(root.data).patches)
      ? asRecord(root.data).patches as unknown[]
      : [];

  const candidates = rows.slice(0, 100).map(row => {
    const patch = asRecord(row);
    if (!/(?:\barena\b|арен)/i.test(arenaPatchText(patch))) return null;
    const dates = [isoDate(patch.official_published_at), isoDate(patch.published_at)]
      .filter((date): date is string => Boolean(date));
    if (!dates.length) return null;
    const publishedAt = dates.sort((left, right) => (
      new Date(right).getTime() - new Date(left).getTime()
    ))[0];
    return {
      version: text(patch.display_version) || text(patch.version) || text(patch.hs_manacost_version) || '—',
      publishedAt,
      publishedAtMs: new Date(publishedAt).getTime(),
    };
  }).filter((patch): patch is NonNullable<typeof patch> => Boolean(patch));

  return candidates.sort((left, right) => right.publishedAtMs - left.publishedAtMs)[0] ?? null;
}

function buildCardMeta(value: unknown): Map<string, CardMeta> {
  const structured = structuredRoot(value);
  const rows = Array.isArray(structured.cards) ? structured.cards : [];
  const result = new Map<string, CardMeta>();
  for (const row of rows.slice(0, 5_000)) {
    const card = normalizeCard(row);
    if (!card) continue;
    const record = asRecord(row);
    result.set(card.id, {
      id: card.id,
      name: card.name,
      cost: card.cost,
      type: card.type,
      rarity: card.rarity,
      deckWinRate: finiteNumber(record.win_rate) ?? finiteNumber(record.deck_winrate),
    });
  }
  return result;
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

type QualityAggregate = { sum: number; count: number };

function buildCardQuality(runs: NormalizedRun[]): Map<string, QualityAggregate> {
  const result = new Map<string, QualityAggregate>();
  for (const run of runs) {
    for (const id of new Set(run.cards.map(card => card.id))) {
      const current = result.get(id) ?? { sum: 0, count: 0 };
      current.sum += run.runQuality;
      current.count += 1;
      result.set(id, current);
    }
  }
  return result;
}

function cardFrom(
  id: string,
  cardMeta: Map<string, CardMeta>,
  fallbackMeta: Map<string, CardMeta>,
  cardQuality: Map<string, QualityAggregate>,
  runs: number,
): ArenaSynergyCard {
  const meta = cardMeta.get(id) ?? fallbackMeta.get(id) ?? {
    id,
    name: id,
    cost: null,
    type: null,
    rarity: null,
    deckWinRate: null,
  };
  const quality = cardQuality.get(id);
  return {
    ...meta,
    twelveWinRunQuality: quality ? round((quality.sum / quality.count) * 100, 1) : null,
    runs,
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function interactionSignalRank(signal: ArenaCombination['interactionSignal']): number {
  if (signal === 'positive') return 3;
  if (signal === 'neutral') return 2;
  if (signal === 'insufficient') return 1;
  return 0;
}

function buildAvailableClasses(runs: NormalizedRun[]) {
  const counts = new Map<ArenaClassId, number>();
  for (const run of runs) counts.set(run.className, (counts.get(run.className) ?? 0) + 1);
  return [
    { id: 'ALL' as const, label: ARENA_CLASS_LABELS.ALL, runs: runs.length },
    ...Array.from(counts.entries())
      .sort(([left], [right]) => ARENA_CLASS_LABELS[left].localeCompare(ARENA_CLASS_LABELS[right], 'ru'))
      .map(([id, count]) => ({ id, label: ARENA_CLASS_LABELS[id], runs: count })),
  ];
}

function buildCombinations(
  runs: NormalizedRun[],
  cardMeta: Map<string, CardMeta>,
  fallbackMeta: Map<string, CardMeta>,
  cardQuality: Map<string, QualityAggregate>,
  minimumPairRuns: number,
  previousSnapshot: ArenaSynergyPreviousSnapshot | null,
  historicalWeight: number,
): ArenaCombination[] {
  const classDeckCounts = new Map<ArenaClassId, number>();
  const classQuality = new Map<ArenaClassId, QualityAggregate>();
  const cardCounts = new Map<string, number>();
  const cardClassCounts = new Map<string, Map<ArenaClassId, number>>();
  const cardClassQuality = new Map<string, Map<ArenaClassId, QualityAggregate>>();
  const observedPairs = new Map<string, { observed: number; forced: number }>();
  const pairClassQuality = new Map<string, Map<ArenaClassId, QualityAggregate>>();

  for (const run of runs) {
    classDeckCounts.set(run.className, (classDeckCounts.get(run.className) ?? 0) + 1);
    const classAggregate = classQuality.get(run.className) ?? { sum: 0, count: 0 };
    classAggregate.sum += run.runQuality;
    classAggregate.count += 1;
    classQuality.set(run.className, classAggregate);
    const ids = Array.from(new Set(run.cards.map(card => card.id))).sort();
    for (const id of ids) {
      cardCounts.set(id, (cardCounts.get(id) ?? 0) + 1);
      const perClass = cardClassCounts.get(id) ?? new Map<ArenaClassId, number>();
      perClass.set(run.className, (perClass.get(run.className) ?? 0) + 1);
      cardClassCounts.set(id, perClass);
      const qualityByClass = cardClassQuality.get(id) ?? new Map<ArenaClassId, QualityAggregate>();
      const cardAggregate = qualityByClass.get(run.className) ?? { sum: 0, count: 0 };
      cardAggregate.sum += run.runQuality;
      cardAggregate.count += 1;
      qualityByClass.set(run.className, cardAggregate);
      cardClassQuality.set(id, qualityByClass);
    }
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const key = pairKey(ids[leftIndex], ids[rightIndex]);
        const current = observedPairs.get(key) ?? { observed: 0, forced: 0 };
        current.observed += 1;
        if (run.packageIds.has(ids[leftIndex]) && run.packageIds.has(ids[rightIndex])) {
          current.forced += 1;
        }
        observedPairs.set(key, current);
        const qualityByClass = pairClassQuality.get(key) ?? new Map<ArenaClassId, QualityAggregate>();
        const pairAggregate = qualityByClass.get(run.className) ?? { sum: 0, count: 0 };
        pairAggregate.sum += run.runQuality;
        pairAggregate.count += 1;
        qualityByClass.set(run.className, pairAggregate);
        pairClassQuality.set(key, qualityByClass);
      }
    }
  }

  const previousCombinations = new Map(
    (previousSnapshot?.payload.combinations ?? []).map(item => [
      pairKey(item.cards[0].id, item.cards[1].id),
      item,
    ]),
  );
  const activeCardIds = new Set(cardMeta.keys());
  const cardStrength = new Map(
    Array.from(cardMeta.entries()).flatMap(([id, meta]) => (
      meta.deckWinRate == null ? [] : [[id, meta.deckWinRate] as const]
    )),
  );
  const combinations: ArenaCombination[] = [];
  for (const [key, pair] of observedPairs) {
    if (pair.observed < minimumPairRuns) continue;
    const [leftId, rightId] = key.split('\u0000');
    let expected = 0;
    for (const [className, classRunCount] of classDeckCounts) {
      const leftCount = cardClassCounts.get(leftId)?.get(className) ?? 0;
      const rightCount = cardClassCounts.get(rightId)?.get(className) ?? 0;
      expected += (leftCount * rightCount) / classRunCount;
    }
    const lift = (pair.observed + 2) / (expected + 2);
    const forcedPackageShare = pair.forced / pair.observed;
    if (lift < MINIMUM_LIFT || forcedPackageShare >= PACKAGE_FILTER_SHARE) continue;

    let expectedQualityWeighted = 0;
    let actualQualityWeighted = 0;
    let leftQualityWeighted = 0;
    let rightQualityWeighted = 0;
    let baselineQualityWeighted = 0;
    let outcomeWeight = 0;
    for (const [className, pairAggregate] of pairClassQuality.get(key) ?? []) {
      const baselineAggregate = classQuality.get(className);
      if (!baselineAggregate?.count) continue;
      const baseline = baselineAggregate.sum / baselineAggregate.count;
      const leftAggregate = cardClassQuality.get(leftId)?.get(className);
      const rightAggregate = cardClassQuality.get(rightId)?.get(className);
      if (!leftAggregate?.count || !rightAggregate?.count) continue;
      const leftSoloCount = Math.max(0, leftAggregate.count - pairAggregate.count);
      const rightSoloCount = Math.max(0, rightAggregate.count - pairAggregate.count);
      const leftSoloSum = Math.max(0, leftAggregate.sum - pairAggregate.sum);
      const rightSoloSum = Math.max(0, rightAggregate.sum - pairAggregate.sum);
      const leftQuality = (
        leftSoloSum + CARD_QUALITY_PRIOR_RUNS * baseline
      ) / (leftSoloCount + CARD_QUALITY_PRIOR_RUNS);
      const rightQuality = (
        rightSoloSum + CARD_QUALITY_PRIOR_RUNS * baseline
      ) / (rightSoloCount + CARD_QUALITY_PRIOR_RUNS);
      const expected = Math.min(1, Math.max(0, leftQuality + rightQuality - baseline));
      const actual = (
        pairAggregate.sum + PAIR_QUALITY_PRIOR_RUNS * expected
      ) / (pairAggregate.count + PAIR_QUALITY_PRIOR_RUNS);
      expectedQualityWeighted += expected * pairAggregate.count;
      actualQualityWeighted += actual * pairAggregate.count;
      leftQualityWeighted += leftQuality * pairAggregate.count;
      rightQualityWeighted += rightQuality * pairAggregate.count;
      baselineQualityWeighted += baseline * pairAggregate.count;
      outcomeWeight += pairAggregate.count;
    }
    const expectedRunQuality = outcomeWeight
      ? (expectedQualityWeighted / outcomeWeight) * 100
      : 0;
    const actualRunQuality = outcomeWeight
      ? (actualQualityWeighted / outcomeWeight) * 100
      : 0;
    const interactionDeltaPoints = actualRunQuality - expectedRunQuality;
    const previous = activeCardIds.has(leftId) && activeCardIds.has(rightId)
      ? previousCombinations.get(key)
      : undefined;
    const pairHistoricalWeight = previous ? historicalWeight : 0;
    const adjustedLift = lift * (1 - pairHistoricalWeight)
      + (previous?.lift ?? lift) * pairHistoricalWeight;
    const adjustedInteractionDelta = interactionDeltaPoints * (1 - pairHistoricalWeight)
      + (previous?.interactionDeltaPoints ?? interactionDeltaPoints) * pairHistoricalWeight;
    const pairAssessment = buildArenaPairAssessment({
      runs,
      leftId,
      rightId,
      cardStrength,
      minimumPairRuns,
      observedRuns: pair.observed,
      adjustedLift,
      adjustedInteractionDeltaPoints: adjustedInteractionDelta,
    });

    combinations.push({
      cards: [
        cardFrom(leftId, cardMeta, fallbackMeta, cardQuality, cardCounts.get(leftId) ?? 0),
        cardFrom(rightId, cardMeta, fallbackMeta, cardQuality, cardCounts.get(rightId) ?? 0),
      ],
      observedRuns: pair.observed,
      expectedRuns: round(expected, 1),
      supportPercent: round((pair.observed / runs.length) * 100, 1),
      lift: round(lift),
      adjustedLift: round(adjustedLift),
      expectedRunQuality: round(expectedRunQuality, 1),
      actualRunQuality: round(actualRunQuality, 1),
      interactionDeltaPoints: round(interactionDeltaPoints, 1),
      adjustedInteractionDeltaPoints: round(adjustedInteractionDelta, 1),
      interactionEvidence: {
        cardARuns: Math.max(0, (cardCounts.get(leftId) ?? 0) - pair.observed),
        cardBRuns: Math.max(0, (cardCounts.get(rightId) ?? 0) - pair.observed),
        pairRuns: pair.observed,
        cardAQuality: round(outcomeWeight ? (leftQualityWeighted / outcomeWeight) * 100 : 0, 1),
        cardBQuality: round(outcomeWeight ? (rightQualityWeighted / outcomeWeight) * 100 : 0, 1),
        classBaselineQuality: round(
          outcomeWeight ? (baselineQualityWeighted / outcomeWeight) * 100 : 0,
          1,
        ),
      },
      ...pairAssessment,
      historicalWeight: round(pairHistoricalWeight),
      forcedPackageShare: round(forcedPackageShare),
    });
  }

  return combinations
    .sort((left, right) => (
      arenaPairClassificationRank(right.classification ?? 'popular')
      - arenaPairClassificationRank(left.classification ?? 'popular')
      || interactionSignalRank(right.interactionSignal) - interactionSignalRank(left.interactionSignal)
      || right.score - left.score
      || right.adjustedLift - left.adjustedLift
      || right.observedRuns - left.observedRuns
    ))
    .slice(0, 60);
}

function buildRedraft(
  runs: NormalizedRun[],
  cardMeta: Map<string, CardMeta>,
  fallbackMeta: Map<string, CardMeta>,
  cardQuality: Map<string, QualityAggregate>,
): ArenaRedraftCard[] {
  const counts = new Map<string, {
    addedCopies: number;
    addedRuns: number;
    discardedCopies: number;
    discardedRuns: number;
  }>();
  const cardRuns = new Map<string, number>();

  for (const run of runs) {
    for (const id of new Set(run.cards.map(card => card.id))) {
      cardRuns.set(id, (cardRuns.get(id) ?? 0) + 1);
    }
    const addedInRun = new Set<string>();
    for (const card of run.added) {
      const current = counts.get(card.id) ?? {
        addedCopies: 0,
        addedRuns: 0,
        discardedCopies: 0,
        discardedRuns: 0,
      };
      current.addedCopies += card.count;
      if (!addedInRun.has(card.id)) current.addedRuns += 1;
      addedInRun.add(card.id);
      counts.set(card.id, current);
      if (!fallbackMeta.has(card.id)) {
        fallbackMeta.set(card.id, { ...card, deckWinRate: null });
      }
    }
    const discardedInRun = new Set<string>();
    for (const card of run.discarded) {
      const current = counts.get(card.id) ?? {
        addedCopies: 0,
        addedRuns: 0,
        discardedCopies: 0,
        discardedRuns: 0,
      };
      current.discardedCopies += card.count;
      if (!discardedInRun.has(card.id)) current.discardedRuns += 1;
      discardedInRun.add(card.id);
      counts.set(card.id, current);
      if (!fallbackMeta.has(card.id)) {
        fallbackMeta.set(card.id, { ...card, deckWinRate: null });
      }
    }
  }

  return Array.from(counts.entries()).map(([id, count]): ArenaRedraftCard => {
    const decisions = count.addedCopies + count.discardedCopies;
    return {
      card: cardFrom(id, cardMeta, fallbackMeta, cardQuality, cardRuns.get(id) ?? 0),
      ...count,
      decisions,
      addShare: decisions ? round(count.addedCopies / decisions) : 0,
      netCopies: count.addedCopies - count.discardedCopies,
    };
  }).sort((left, right) => (
    right.decisions - left.decisions
    || Math.abs(right.netCopies) - Math.abs(left.netCopies)
    || left.card.name.localeCompare(right.card.name, 'ru')
  )).slice(0, 240);
}

export function analyzeArenaSynergies(input: ArenaSynergyAnalysisInput): ArenaSynergyPayload {
  const now = input.now ?? new Date();
  const normalization = normalizeRuns(input.winningDecks, now.getTime());
  const allNormalizedRuns = normalization.runs
    .sort((left, right) => right.playedAtMs - left.playedAtMs);
  const seenRunIds = new Set<string>();
  let duplicateRuns = 0;
  const deduplicatedRuns = allNormalizedRuns.filter(run => {
    if (seenRunIds.has(run.id)) {
      duplicateRuns += 1;
      return false;
    }
    seenRunIds.add(run.id);
    return true;
  });
  const patch = findLatestArenaPatch(input.patches);
  const currentCohortRuns = patch
    ? deduplicatedRuns.filter(run => run.playedAtMs >= patch.publishedAtMs)
    : deduplicatedRuns;
  const runsAvailable = currentCohortRuns.length;
  const cohortRuns = currentCohortRuns.slice(0, SAMPLE_LIMIT);
  const selectedRuns = input.className === 'ALL'
    ? cohortRuns
    : cohortRuns.filter(run => run.className === input.className);
  const cardMeta = buildCardMeta(input.cardStats);
  const fallbackMeta = new Map<string, CardMeta>();
  for (const run of cohortRuns) {
    for (const card of [...run.cards, ...run.added, ...run.discarded]) {
      if (!fallbackMeta.has(card.id)) {
        fallbackMeta.set(card.id, {
          id: card.id,
          name: card.name,
          cost: card.cost,
          type: card.type,
          rarity: card.rarity,
          deckWinRate: null,
        });
      }
    }
  }
  const poolFingerprint = createHash('sha256')
    .update(Array.from(cardMeta.keys()).sort().join('|'))
    .digest('hex')
    .slice(0, 16);
  const cohortId = `${patch?.version ?? 'unknown'}:${poolFingerprint}`;
  const previousSameCohort = input.previousSnapshot?.payload.cohort.id === cohortId
    ? input.previousSnapshot
    : null;
  const previousForBlend = input.previousSnapshot?.payload.cohort.id !== cohortId
    ? input.previousSnapshot ?? null
    : null;
  const previousGeneratedAt = previousForBlend
    ? Date.parse(previousForBlend.payload.generatedAt)
    : Number.NaN;
  const historyAgeDays = Number.isFinite(previousGeneratedAt)
    ? Math.max(0, (now.getTime() - previousGeneratedAt) / 86_400_000)
    : 0;
  const historicalWeight = previousForBlend
    ? Math.min(
        0.35,
        Math.max(0, (STABLE_SAMPLE_RUNS - selectedRuns.length) / STABLE_SAMPLE_RUNS)
          * 0.35
          * Math.exp(-historyAgeDays / 45),
      )
    : 0;
  const minimumPairRuns = Math.max(5, Math.ceil(selectedRuns.length * 0.025));
  const warnings: string[] = [];
  if (!patch) warnings.push('Не удалось определить последний патч Арены: выборка не отсечена по патчу.');
  if (cohortRuns.length < SAMPLE_LIMIT) {
    warnings.push(`После текущего патча доступно только ${cohortRuns.length} из ${SAMPLE_LIMIT} забегов.`);
  }
  if (selectedRuns.length < 50) {
    warnings.push('В выбранном классе меньше 50 забегов: сочетания считаются предварительными.');
  }
  if (historicalWeight > 0) {
    warnings.push(
      `Новая когорта ещё набирает данные: до ${Math.round(historicalWeight * 100)}% веса сигнала `
      + 'может приходить из прошлого патча только для карт текущего пула.',
    );
  }

  const recordCounts: Record<string, number> = {};
  for (const run of selectedRuns) {
    recordCounts[run.record] = (recordCounts[run.record] ?? 0) + 1;
  }
  const orderedRuns = [...selectedRuns].sort((left, right) => left.playedAtMs - right.playedAtMs);
  const winningRoot = asRecord(input.winningDecks);
  const cardStatsRoot = asRecord(input.cardStats);
  const winningFetchedAt = isoDate(winningRoot.fetched_at);
  const sourceAgeHours = winningFetchedAt
    ? Math.max(0, (now.getTime() - Date.parse(winningFetchedAt)) / 3_600_000)
    : null;
  const classCounts = new Map<ArenaClassId, number>();
  const playerCounts = new Map<string, number>();
  for (const run of cohortRuns) {
    classCounts.set(run.className, (classCounts.get(run.className) ?? 0) + 1);
    if (run.playerKey) playerCounts.set(run.playerKey, (playerCounts.get(run.playerKey) ?? 0) + 1);
  }
  const maximumShare = (counts: Iterable<number>, denominator: number) => denominator
    ? Math.max(0, ...Array.from(counts, count => count / denominator))
    : 0;
  let totalCardReferences = 0;
  let unknownCardReferences = 0;
  for (const run of cohortRuns) {
    for (const card of run.cards) {
      totalCardReferences += 1;
      if (!cardMeta.has(card.id)) unknownCardReferences += 1;
    }
  }
  const volumeRatioToPrevious = previousSameCohort
    && previousSameCohort.payload.dataQuality.metrics.sourceRows > 0
    ? normalization.sourceRows / previousSameCohort.payload.dataQuality.metrics.sourceRows
    : null;
  const qualityProfile: ArenaNormalizationProfile = {
    schemaValid: normalization.schemaValid,
    sourceRows: normalization.sourceRows,
    validRuns: normalization.runs.length,
    invalidRuns: normalization.invalidRuns,
    duplicateRuns,
    futureRuns: normalization.futureRuns,
    impossibleDecks: normalization.impossibleDecks,
    unknownCardReferences,
    totalCardReferences,
    maxClassShare: maximumShare(classCounts.values(), cohortRuns.length),
    maxPlayerShare: maximumShare(playerCounts.values(), cohortRuns.length),
    sourceAgeHours,
    volumeRatioToPrevious,
  };
  const dataQuality = assessArenaDataQuality(qualityProfile);
  if (dataQuality.status !== 'healthy') {
    warnings.push(
      dataQuality.status === 'blocked'
        ? 'Новый расчёт заблокирован проверками качества данных.'
        : 'В источнике найдены отклонения качества; откройте блок проверки данных.',
    );
  }
  const cardQuality = buildCardQuality(selectedRuns);
  const sampleMode = selectedRuns.length >= STABLE_SAMPLE_RUNS
    ? 'stable'
    : selectedRuns.length >= 20
      ? 'warming'
      : 'insufficient';

  return {
    schemaVersion: 2,
    generatedAt: now.toISOString(),
    selectedClass: input.className,
    source: {
      winningDecksFetchedAt: winningFetchedAt,
      cardStatsFetchedAt: isoDate(cardStatsRoot.fetched_at),
    },
    cohort: {
      id: cohortId,
      patchVersion: patch?.version ?? null,
      patchPublishedAt: patch?.publishedAt ?? null,
      poolFingerprint,
      from: orderedRuns[0]?.playedAt ?? null,
      to: orderedRuns.at(-1)?.playedAt ?? null,
    },
    summary: {
      runsAvailable,
      runsAnalyzed: selectedRuns.length,
      redraftRuns: selectedRuns.filter(run => run.added.length > 0 || run.discarded.length > 0).length,
      recordCounts,
      warnings,
    },
    availableClasses: buildAvailableClasses(cohortRuns),
    methodology: {
      sampleLimit: SAMPLE_LIMIT,
      minimumPairRuns,
      minimumLift: MINIMUM_LIFT,
      packageFilterShare: PACKAGE_FILTER_SHARE,
      classStratified: input.className === 'ALL',
      outcomeMetric: 'Доля побед в завершённом 12-win забеге: 12-0 > 12-1 > 12-2',
      note: 'Дополнительный эффект сравнивает качество 12-win забегов пары с консервативным ожиданием '
        + 'от каждой карты отдельно внутри класса. Проигрышных забегов в источнике нет, поэтому это не причинный прирост побед.',
    },
    dataQuality,
    reliability: {
      sampleMode,
      servedFrom: 'live',
      currentWeight: round(1 - historicalWeight),
      historicalWeight: round(historicalWeight),
      stableAtRuns: STABLE_SAMPLE_RUNS,
      previousCohortId: previousForBlend?.payload.cohort.id ?? null,
      limitations: [
        'Источник содержит только забеги с 12 победами; контрольной группы проигрышных забегов нет.',
        'Дополнительный эффект различает 12-0, 12-1 и 12-2, но не доказывает причинность.',
        'Статистика redraft не содержит полного списка предложенных, но не выбранных карт.',
      ],
    },
    history: [],
    combinations: selectedRuns.length
      ? buildCombinations(
          selectedRuns,
          cardMeta,
          fallbackMeta,
          cardQuality,
          minimumPairRuns,
          previousForBlend,
          historicalWeight,
        )
      : [],
    redraft: buildRedraft(selectedRuns, cardMeta, fallbackMeta, cardQuality),
  };
}
