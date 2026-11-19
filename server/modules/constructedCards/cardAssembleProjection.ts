/**
 * «Сборка» (Assemble) statistics: bases, donors and the half of a donor players take,
 * from hs-data-api `/v1/hsreplay/assemble`. The upstream body is untrusted; only the
 * fields the card page renders are projected, in the shape the Russian site needs.
 */
export type CardAssembleFormat = 'standard' | 'wild';
export type AssembleHalf = 'effect' | 'trigger';

export const CARD_ID = /^[A-Za-z0-9_]{2,80}$/;
const MAX_BASES = 300;
const MAX_DONORS = 200;
const MAX_TEXT = 400;

export type AssembleCard = {
  cardId: string;
  dbfId: number;
  name: string;
  cost: number | null;
  cardClass: string | null;
  rarity: string | null;
};
export type AssembleText = { trigger: string; effect: string; locale: 'ru' | 'en' };
export type AssembleOption = {
  /** The half of the DONOR; the other half comes from the base. */
  half: AssembleHalf;
  text: AssembleText | null;
  pickRate: number | null;
  winRate: number | null;
  picks: number | null;
  lowSample: boolean;
  undervalued: boolean;
};
export type AssembleDonor = {
  card: AssembleCard;
  offerRate: number | null;
  pickRate: number | null;
  winRate: number | null;
  picks: number | null;
  lowSample: boolean;
  options: AssembleOption[];
};
export type AssembleBase = {
  card: AssembleCard;
  offerRate: number | null;
  winRate: number | null;
  lowSample: boolean;
  donorsTotal: number;
  /** `null`: the donors of this base were not requested. */
  donors: AssembleDonor[] | null;
};
export type CardAssemblePayload = {
  cardId: string;
  format: CardAssembleFormat;
  /** `ok`, `no_data`, `not_collected` or `failed`. */
  state: string;
  checkedAt: string | null;
  asOf: string | null;
  stale: boolean;
  sourceUrl: string | null;
  timeRange: string;
  originalClassOnly: boolean;
  basesTotal: number;
  winRate: number | null;
  bases: AssembleBase[];
};

type Record_ = Record<string, unknown>;

function record(value: unknown): Record_ {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record_ : {};
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percent(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number >= 0 && number <= 100 ? number : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function shortText(value: unknown): string | null {
  const result = text(value);
  return result !== null && result.length <= MAX_TEXT ? result : null;
}

export function isFormat(value: unknown): value is CardAssembleFormat {
  return value === 'standard' || value === 'wild';
}

function readCard(value: unknown): AssembleCard | null {
  const row = record(value);
  const cardId = text(row.card_id);
  const dbfId = finite(row.dbf_id);
  if (!cardId || !CARD_ID.test(cardId) || dbfId === null || !Number.isSafeInteger(dbfId)) return null;
  return {
    cardId,
    dbfId,
    name: text(row.name_ru) ?? text(row.name) ?? cardId,
    cost: finite(row.cost),
    cardClass: text(row.card_class),
    rarity: text(row.rarity),
  };
}

function readLocaleText(value: unknown, locale: 'ru' | 'en'): AssembleText | null {
  const row = record(value);
  const trigger = shortText(row.trigger);
  const effect = shortText(row.effect);
  return trigger && effect ? { trigger, effect, locale } : null;
}

function readOption(value: unknown): AssembleOption | null {
  const row = record(value);
  if (row.half !== 'effect' && row.half !== 'trigger') return null;
  const source = record(row.text);
  return {
    half: row.half,
    text: readLocaleText(source.ru, 'ru') ?? readLocaleText(source.en, 'en'),
    pickRate: percent(row.pick_rate),
    winRate: percent(row.win_rate),
    picks: count(row.picks),
    lowSample: row.low_sample === true,
    undervalued: row.undervalued === true,
  };
}

/** Both halves, effect first; `null` when either is missing, doubled or broken. */
function readOptions(value: unknown): AssembleOption[] | null {
  const byHalf = new Map<AssembleHalf, AssembleOption>();
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 8)) {
      const option = readOption(item);
      if (option && !byHalf.has(option.half)) byHalf.set(option.half, option);
    }
  }
  const effect = byHalf.get('effect');
  const trigger = byHalf.get('trigger');
  return effect && trigger ? [effect, trigger] : null;
}

function readDonor(value: unknown): AssembleDonor | null {
  const row = record(value);
  const card = readCard(row.card);
  const options = readOptions(row.options);
  if (!card || !options) return null;
  return {
    card,
    offerRate: percent(row.offer_rate),
    pickRate: percent(row.pick_rate),
    winRate: percent(row.win_rate),
    picks: count(row.picks),
    lowSample: row.low_sample === true,
    options,
  };
}

function readBase(value: unknown): AssembleBase | null {
  const row = record(value);
  const card = readCard(row.card);
  if (!card) return null;
  const donors = Array.isArray(row.donors)
    ? row.donors.slice(0, MAX_DONORS).flatMap(item => readDonor(item) ?? [])
    : null;
  return {
    card,
    offerRate: percent(row.offer_rate),
    winRate: percent(row.win_rate),
    lowSample: row.low_sample === true,
    donorsTotal: count(row.donors_total) ?? donors?.length ?? 0,
    donors,
  };
}

/** Projects one hs-data-api answer; `null` when it is not an Assemble answer. */
export function projectCardAssemble(body: unknown, requested?: { cardId: string; format: CardAssembleFormat }): CardAssemblePayload | null {
  const data = record(record(body).data);
  const card = readCard(data.card);
  if (!card || !isFormat(data.format) || !Array.isArray(data.bases)) return null;
  // An answer for another card or format must not be cached under the requested key (the id may also be a dbf id).
  if (requested && (data.format !== requested.format
    || (card.cardId.toLowerCase() !== requested.cardId.toLowerCase() && String(card.dbfId) !== requested.cardId))) return null;
  const stats = record(data.stats);
  const summary = record(data.summary);
  const sourceUrl = text(stats.source_url);
  const bases = data.bases.slice(0, MAX_BASES).flatMap(item => readBase(item) ?? []);
  return {
    cardId: card.cardId,
    format: data.format,
    state: text(stats.state) ?? 'not_collected',
    checkedAt: text(stats.checked_at),
    asOf: text(stats.as_of),
    stale: stats.stale === true,
    sourceUrl: sourceUrl && /^https:\/\/hsreplay\.net\//.test(sourceUrl) ? sourceUrl : null,
    timeRange: text(data.time_range) ?? 'LAST_7_DAYS',
    originalClassOnly: data.original_class_only === true,
    basesTotal: count(summary.bases_total) ?? bases.length,
    winRate: percent(summary.win_rate),
    bases,
  };
}
