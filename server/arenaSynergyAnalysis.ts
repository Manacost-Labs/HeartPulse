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

const SAMPLE_LIMIT = 500;
const MINIMUM_LIFT = 1.25;
const PACKAGE_FILTER_SHARE = 0.5;

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
  cards: NormalizedCard[];
  added: NormalizedCard[];
  discarded: NormalizedCard[];
  packageIds: Set<string>;
};

type CardMeta = Omit<ArenaSynergyCard, 'runs'>;

export type ArenaSynergyAnalysisInput = {
  winningDecks: unknown;
  cardStats: unknown;
  patches: unknown;
  className: ArenaClassId;
  now?: Date;
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

function normalizeRuns(value: unknown): NormalizedRun[] {
  const structured = structuredRoot(value);
  const rows = Array.isArray(structured.decks) ? structured.decks : [];

  return rows.slice(0, 2_000).map((row, index): NormalizedRun | null => {
    const run = asRecord(row);
    const record = normalizeRecord(run.record);
    const className = normalizeClass(run.main_class) ?? normalizeClass(run.class);
    const playedAt = isoDate(run.played_at);
    const cards = normalizeCardList(run.final_deck);
    if (!record || !className || !playedAt || !cards.length) return null;

    const packageCards = normalizeCardList(run.package_cards);
    const packageIds = new Set(packageCards.map(card => card.id));
    const packageKeyId = text(run.package_key_card_id);
    if (packageKeyId) packageIds.add(packageKeyId);
    const draftId = text(run.draft_id);

    return {
      id: draftId || `${className}:${playedAt}:${index}`,
      className,
      record,
      playedAt,
      playedAtMs: new Date(playedAt).getTime(),
      cards,
      added: normalizeCardList(run.added),
      discarded: normalizeCardList(run.discarded),
      packageIds,
    };
  }).filter((run): run is NormalizedRun => Boolean(run));
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

function cardFrom(
  id: string,
  cardMeta: Map<string, CardMeta>,
  fallbackMeta: Map<string, CardMeta>,
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
  return { ...meta, runs };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
  minimumPairRuns: number,
): ArenaCombination[] {
  const classDeckCounts = new Map<ArenaClassId, number>();
  const cardCounts = new Map<string, number>();
  const cardClassCounts = new Map<string, Map<ArenaClassId, number>>();
  const observedPairs = new Map<string, { observed: number; forced: number }>();

  for (const run of runs) {
    classDeckCounts.set(run.className, (classDeckCounts.get(run.className) ?? 0) + 1);
    const ids = Array.from(new Set(run.cards.map(card => card.id))).sort();
    for (const id of ids) {
      cardCounts.set(id, (cardCounts.get(id) ?? 0) + 1);
      const perClass = cardClassCounts.get(id) ?? new Map<ArenaClassId, number>();
      perClass.set(run.className, (perClass.get(run.className) ?? 0) + 1);
      cardClassCounts.set(id, perClass);
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
      }
    }
  }

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

    const supportStrength = 1 - Math.exp(-pair.observed / 12);
    const liftStrength = Math.min(1, Math.max(0, Math.log2(lift)));
    const score = Math.round(100 * supportStrength * liftStrength);
    const confidence = pair.observed >= 20 && lift >= 1.5
      ? 'high'
      : pair.observed >= 10 && lift >= 1.35
        ? 'medium'
        : 'exploratory';

    combinations.push({
      cards: [
        cardFrom(leftId, cardMeta, fallbackMeta, cardCounts.get(leftId) ?? 0),
        cardFrom(rightId, cardMeta, fallbackMeta, cardCounts.get(rightId) ?? 0),
      ],
      observedRuns: pair.observed,
      expectedRuns: round(expected, 1),
      supportPercent: round((pair.observed / runs.length) * 100, 1),
      lift: round(lift),
      score,
      confidence,
      forcedPackageShare: round(forcedPackageShare),
    });
  }

  return combinations
    .sort((left, right) => (
      right.score - left.score
      || right.lift - left.lift
      || right.observedRuns - left.observedRuns
    ))
    .slice(0, 60);
}

function buildRedraft(
  runs: NormalizedRun[],
  cardMeta: Map<string, CardMeta>,
  fallbackMeta: Map<string, CardMeta>,
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
      card: cardFrom(id, cardMeta, fallbackMeta, cardRuns.get(id) ?? 0),
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
  const allNormalizedRuns = normalizeRuns(input.winningDecks)
    .sort((left, right) => right.playedAtMs - left.playedAtMs);
  const seenRunIds = new Set<string>();
  const deduplicatedRuns = allNormalizedRuns.filter(run => {
    if (seenRunIds.has(run.id)) return false;
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
  const minimumPairRuns = Math.max(5, Math.ceil(selectedRuns.length * 0.025));
  const warnings: string[] = [];
  if (!patch) warnings.push('Не удалось определить последний патч Арены: выборка не отсечена по патчу.');
  if (cohortRuns.length < SAMPLE_LIMIT) {
    warnings.push(`После текущего патча доступно только ${cohortRuns.length} из ${SAMPLE_LIMIT} забегов.`);
  }
  if (selectedRuns.length < 50) {
    warnings.push('В выбранном классе меньше 50 забегов: сочетания считаются предварительными.');
  }

  const recordCounts: Record<string, number> = {};
  for (const run of selectedRuns) {
    recordCounts[run.record] = (recordCounts[run.record] ?? 0) + 1;
  }
  const orderedRuns = [...selectedRuns].sort((left, right) => left.playedAtMs - right.playedAtMs);
  const winningRoot = asRecord(input.winningDecks);
  const cardStatsRoot = asRecord(input.cardStats);

  return {
    schemaVersion: 1,
    generatedAt: (input.now ?? new Date()).toISOString(),
    selectedClass: input.className,
    source: {
      winningDecksFetchedAt: isoDate(winningRoot.fetched_at),
      cardStatsFetchedAt: isoDate(cardStatsRoot.fetched_at),
    },
    cohort: {
      id: `${patch?.version ?? 'unknown'}:${poolFingerprint}`,
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
      note: 'Связь показывает совместную встречаемость в 12-победных колодах, а не доказывает причинный прирост побед.',
    },
    combinations: selectedRuns.length
      ? buildCombinations(selectedRuns, cardMeta, fallbackMeta, minimumPairRuns)
      : [],
    redraft: buildRedraft(selectedRuns, cardMeta, fallbackMeta),
  };
}
