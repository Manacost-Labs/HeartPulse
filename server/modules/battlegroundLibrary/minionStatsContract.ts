/** The upstream answer broke the contract; the route reports it as an unavailable source. */
export class BattlegroundMinionStatsContractError extends Error {
  override name = 'BattlegroundMinionStatsContractError';
}

const UPLOADS_ORIGIN = 'https://api.kolodahearthstone.com';

import type {
  BattlegroundMinionBoard,
  BattlegroundMinionRoundStat,
  BattlegroundMinionStats,
  BattlegroundMinionStatsTotals,
} from './minionStatsTypes.js';

export type {
  BattlegroundMinionBoard,
  BattlegroundMinionBoardSlot,
  BattlegroundMinionPurchase,
  BattlegroundMinionRound,
  BattlegroundMinionRoundStat,
  BattlegroundMinionStats,
  BattlegroundMinionStatsTotals,
} from './minionStatsTypes.js';

type JsonRecord = Record<string, unknown>;

function invalid(message: string): never {
  throw new BattlegroundMinionStatsContractError(`bg-minion-stats: ${message}`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as JsonRecord;
}

function optionalRecord(value: unknown, label: string): JsonRecord | null {
  return value === null || value === undefined ? null : record(value, label);
}

function list(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid(`${label} must be an array of at most ${maximum}`);
  return value;
}

function measure(value: unknown, label: string, minimum = -Infinity, maximum = Infinity): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) invalid(`${label} is out of range`);
  return value;
}

function count(value: unknown, label: string): number {
  if (value === null || value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(`${label} must be a non-negative integer`);
  return value;
}

function index(value: unknown, label: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) invalid(`${label} is out of range`);
  return value;
}

function text(value: unknown, maximum = 200): string | null {
  return typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : null;
}

function rate(value: unknown, label: string): number | null {
  return measure(value, label, 0, 100);
}

/** Only hs-data-api uploads are drawn, through the same-origin resource proxy (`shared/publicResourceUrl.ts`). */
function image(value: unknown): string | null {
  const raw = text(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin === UPLOADS_ORIGIN && url.pathname.startsWith('/uploads/')
      ? `/api/public-resource/db${url.pathname}${url.search}`
      : null;
  } catch {
    return null;
  }
}

function totals(value: unknown, label: string): BattlegroundMinionStatsTotals | null {
  const source = optionalRecord(value, label);
  if (!source) return null;
  const parsed = {
    impact: measure(source.impact, `${label}.impact`, -8, 8),
    combatWinrate: rate(source.combat_winrate, `${label}.combat_winrate`),
    popularity: rate(source.popularity, `${label}.popularity`),
    gamesWith: count(source.games_with_minion, `${label}.games_with_minion`),
    placementWith: measure(source.avg_placement_with, `${label}.avg_placement_with`, 1, 8),
    placementWithout: measure(source.avg_placement_without, `${label}.avg_placement_without`, 1, 8),
    wins: count(source.wins, `${label}.wins`),
    losses: count(source.losses, `${label}.losses`),
  };
  // HSReplay lists every pool minion; one nobody played carries only zeroes and nulls.
  return parsed.gamesWith > 0 ? parsed : null;
}

function roundStat(value: unknown, label: string): BattlegroundMinionRoundStat | null {
  const source = optionalRecord(value, label);
  if (!source) return null;
  return {
    impact: measure(source.impact, `${label}.impact`, -8, 8),
    combatWinrate: rate(source.combat_winrate, `${label}.combat_winrate`),
    popularity: rate(source.popularity, `${label}.popularity`),
    wins: count(source.wins, `${label}.wins`),
    losses: count(source.losses, `${label}.losses`),
  };
}

function median(value: unknown, label: string): [number, number] | null {
  const source = optionalRecord(value, label);
  if (!source) return null;
  const attack = measure(source.attack, `${label}.attack`, 0, 100_000);
  const health = measure(source.health, `${label}.health`, 0, 100_000);
  return attack === null || health === null ? null : [attack, health];
}

function copies(value: unknown, label: string): [number | null, number | null, number | null] {
  const source = optionalRecord(value, label) ?? {};
  return [
    rate(source.first_copy, `${label}.first_copy`),
    rate(source.second_copy, `${label}.second_copy`),
    rate(source.third_copy, `${label}.third_copy`),
  ];
}

function board(value: unknown, label: string): BattlegroundMinionBoard | null {
  const source = optionalRecord(value, label);
  if (!source) return null;
  const slots = list(source.positions, `${label}.positions`, 7).map((entry, offset) => {
    const slot = record(entry, `${label}.positions[${offset}]`);
    return {
      position: index(slot.position, `${label}.positions[${offset}].position`, 7),
      popularity: rate(slot.popularity, `${label}.positions[${offset}].popularity`),
      impact: measure(slot.impact, `${label}.positions[${offset}].impact`, -8, 8),
      occurrences: count(slot.occurrences, `${label}.positions[${offset}].occurrences`),
    };
  }).sort((left, right) => left.position - right.position);
  const occurrences = count(source.occurrences, `${label}.occurrences`);
  return occurrences > 0 && slots.length ? { occurrences, slots } : null;
}

function latest(values: unknown[]): string | null {
  const times = values.map(value => text(value, 64)).filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))));
  return times.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

/**
 * Validates the `data` object of hs-data-api
 * `GET /v1/battlegrounds/minions/{dbf_id}/stats` and keeps only what the
 * minion page draws. Images are rewritten to the same-origin resource proxy.
 * Throws `BattlegroundMinionStatsContractError` when the upstream shape is broken.
 */
export function parseBattlegroundMinionStats(value: unknown): BattlegroundMinionStats {
  const data = record(value, 'data');
  const minion = record(data.minion, 'minion');
  const images = optionalRecord(minion.images, 'minion.images') ?? {};
  const slice = record(data.slice, 'slice');
  const positions = record(data.positions, 'positions');
  const dbfId = index(minion.dbf_id, 'minion.dbf_id', Number.MAX_SAFE_INTEGER);
  if (dbfId < 1) invalid('minion.dbf_id must be positive');
  const cardId = text(minion.card_id, 40);
  if (!cardId) invalid('minion.card_id must be a string');
  const asOf = optionalRecord(slice.as_of, 'slice.as_of') ?? {};
  const rounds = list(data.rounds, 'rounds', 40).map((entry, offset) => {
    const row = record(entry, `rounds[${offset}]`);
    return { round: index(row.combat_round, `rounds[${offset}].combat_round`, 40), row };
  });
  const medians = new Map(list(data.medians, 'medians', 40).map((entry, offset) => {
    const row = record(entry, `medians[${offset}]`);
    return [index(row.combat_round, `medians[${offset}].combat_round`, 40), row] as const;
  }));
  return {
    minion: {
      dbfId,
      cardId,
      nameRu: text(minion.name_ru),
      tavernTier: measure(minion.tavern_tier, 'minion.tavern_tier', 1, 7),
      attack: measure(minion.attack, 'minion.attack', 0, 1000),
      health: measure(minion.health, 'minion.health', 0, 1000),
      images: { card: image(images.card), cardGolden: image(images.card_golden), art: image(images.art) },
    },
    slice: {
      mmr: text(slice.mmr_percentile, 40) ?? invalid('slice.mmr_percentile must be a string'),
      period: text(slice.time_range, 60) ?? invalid('slice.time_range must be a string'),
      fetchedAt: latest([slice.fetched_at]),
      updatedAt: latest(Object.values(asOf)),
    },
    normal: totals(data.normal, 'normal'),
    golden: totals(data.golden, 'golden'),
    rounds: rounds.sort((left, right) => left.round - right.round).map(({ round, row }) => ({
      round,
      normal: roundStat(row.normal, `rounds.${round}.normal`),
      golden: roundStat(row.golden, `rounds.${round}.golden`),
      median: {
        normal: median(medians.get(round)?.normal, `medians.${round}.normal`),
        golden: median(medians.get(round)?.golden, `medians.${round}.golden`),
      },
    })),
    purchases: list(data.purchases, 'purchases', 40).map((entry, offset) => {
      const row = record(entry, `purchases[${offset}]`);
      return {
        round: index(row.recruitment_round, `purchases[${offset}].recruitment_round`, 40),
        copies: copies(row, `purchases[${offset}]`),
        discover: copies(row.discover, `purchases[${offset}].discover`),
      };
    }).sort((left, right) => left.round - right.round),
    positions: {
      compositionId: index(positions.composition_id, 'positions.composition_id', 10_000),
      defaultBoard: positions.default_board === 'taunt' ? 'taunt' : 'normal',
      normal: board(positions.normal, 'positions.normal'),
      taunt: board(positions.taunt, 'positions.taunt'),
      compositions: list(positions.compositions ?? [], 'positions.compositions', 100).flatMap((entry, offset) => {
        const composition = record(entry, `positions.compositions[${offset}]`);
        const name = text(composition.name, 80);
        return name ? [{ id: index(composition.composition_id, `positions.compositions[${offset}].composition_id`, 10_000), name }] : [];
      }),
    },
  };
}

/** True when the slice has at least one played board of the minion, normal or golden. */
export function hasBattlegroundMinionStats(stats: BattlegroundMinionStats): boolean {
  return Boolean(stats.normal || stats.golden);
}
