/**
 * "What players pick" of a card with a choice (Discover — «Открытие» on the site,
 * Adapt, Dredge — «Улов», Choose One — «Выберите эффект», Excavate — «Добыча»), as `/api/card-choices/:format/:cardId`
 * answers it (the Express projection of hs-data-api `/v1/hsreplay/card-choices`).
 */
export type CardChoiceFormat = 'standard' | 'wild';
export type CardChoiceRank = 'legend' | 'bronze_gold';
export type CardChoiceKind = 'discover' | 'adapt' | 'dredge' | 'choose_one' | 'excavate';

export type CardChoiceCard = {
  cardId: string;
  dbfId: number | null;
  name: string;
  cost: number | null;
  cardClass: string | null;
  rarity: string | null;
};
export type CardChoiceOption = CardChoiceCard & {
  /** How often the option is taken when it is offered (the column sums to more than 100%). */
  popularity: number | null;
  winrate: number | null;
  lowSample: boolean;
  undervalued: boolean;
};
export type CardChoicePoolCard = CardChoiceCard & { hasStats: boolean; popularity: number | null; winrate: number | null };
export type CardChoicesData = {
  cardId: string;
  kind: CardChoiceKind;
  format: CardChoiceFormat;
  rank: CardChoiceRank;
  state: string;
  tracked: boolean;
  checkedAt: string | null;
  asOf: string | null;
  stale: boolean;
  sourceUrl: string | null;
  options: CardChoiceOption[];
  pool: {
    resolved: boolean;
    reason: string | null;
    classDependent: boolean;
    total: number;
    cards: CardChoicePoolCard[];
    tiers: { tier: number; cards: CardChoiceCard[] }[];
  };
  available: { format: CardChoiceFormat; rank: CardChoiceRank }[];
};

export const CARD_CHOICE_RANK_OPTIONS: readonly { id: CardChoiceRank; label: string }[] = [
  { id: 'legend', label: 'Легенда' },
  { id: 'bronze_gold', label: 'Бронза–Золото' },
];

const MECHANIC_KINDS: readonly [string, CardChoiceKind][] = [
  ['EXCAVATE', 'excavate'],
  ['DISCOVER', 'discover'],
  ['ADAPT', 'adapt'],
  ['DREDGE', 'dredge'],
  ['CHOOSE_ONE', 'choose_one'],
];

/**
 * The choice mechanic of a card by its own mechanics, in the order hs-data-api
 * classifies it (a Choose One between two Discovers counts as Discover). Cards
 * without one never request the section.
 */
export function cardChoiceKindOf(mechanics: readonly unknown[] | null | undefined): CardChoiceKind | null {
  const own = new Set((mechanics ?? []).map(item => String(item).toUpperCase()));
  return MECHANIC_KINDS.find(([mechanic]) => own.has(mechanic))?.[1] ?? null;
}

/** Section titles: Discover is «Открытие» (the site's term), Excavate is «Добыча» (the Russian client's). */
export function cardChoiceTitle(kind: CardChoiceKind): string {
  switch (kind) {
    case 'adapt': return 'Что берут из Адаптации';
    case 'dredge': return 'Что берут из Улова';
    case 'choose_one': return 'Варианты «Выберите эффект»';
    case 'excavate': return 'Сокровища Добычи';
    default: return 'Что берут из Открытия';
  }
}

export const CARD_CHOICE_TIER_LABELS: Record<number, string> = {
  1: 'Уровень 1 · обычные',
  2: 'Уровень 2 · редкие',
  3: 'Уровень 3 · эпические',
  4: 'Уровень 4 · легендарное сокровище',
};

/** Card render served through the site's public-resource proxy. */
export function cardChoiceImage(cardId: string, size: 256 | 512 = 256): string {
  return `/api/public-resource/hsjson/v1/render/latest/ruRU/${size}x/${encodeURIComponent(cardId)}.png`;
}

export function formatChoicePercent(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Average winrate of the options with a real sample: the line one card's options are compared against. */
export function cardChoiceMeanWinrate(options: readonly CardChoiceOption[]): number | null {
  const solid = options.filter(option => !option.lowSample && option.winrate !== null);
  return solid.length ? solid.reduce((sum, option) => sum + (option.winrate ?? 0), 0) / solid.length : null;
}

/**
 * Winrate tone for the positive/negative data colours. Options of one card are
 * compared with each other (their average), not with 50%: a Discover card's
 * options often all sit a few points apart below or above the even line.
 */
export function cardChoiceWinrateTone(value: number | null, mean: number | null): 'positive' | 'negative' | 'neutral' {
  if (value === null || mean === null) return 'neutral';
  if (value >= mean + 1.5) return 'positive';
  return value <= mean - 3 ? 'negative' : 'neutral';
}

/** Why an empty statistics block is empty, in the reader's words. */
export function cardChoiceEmptyText(data: CardChoicesData, rankLabel: string): string {
  if (!data.tracked) return data.kind === 'excavate'
    ? 'Добыча выдаёт случайное сокровище, а не выбор, поэтому статистики выбора нет.'
    : 'HSReplay не считает выбор «Выберите эффект» — ниже оба варианта карты.';
  if (data.state === 'not_collected') return 'Мало данных: статистику этой карты пока не собираем — ниже полный пул вариантов.';
  if (data.state === 'ok' || data.state === 'no_data') return `Мало данных: HSReplay ещё не набрал достаточно игр с этой картой на ранге «${rankLabel}».`;
  return 'Мало данных: статистика этой карты ещё собирается.';
}

export function cardChoiceDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
}
