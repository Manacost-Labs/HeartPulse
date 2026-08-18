export type ConstructedCardCatalogQueryRecord = {
  card_id?: unknown;
  slug?: unknown;
  name?: unknown;
  card_set?: unknown;
  card_type?: unknown;
  class?: unknown;
  multi_class?: unknown;
  rarity?: unknown;
  mana_cost?: unknown;
  attack?: unknown;
  health?: unknown;
  minion_type?: unknown;
  minion_types?: unknown;
  spell_school?: unknown;
  mechanics?: unknown;
  referenced_tags?: unknown;
  stats?: unknown;
};

export type ConstructedCardCatalogQueryInput = Readonly<{
  query?: unknown;
  class?: unknown;
  deckClass?: unknown;
  set?: unknown;
  mechanic?: unknown;
  minionType?: unknown;
  spellSchool?: unknown;
  type?: unknown;
  rarity?: unknown;
  mana?: unknown;
  attack?: unknown;
  health?: unknown;
  sort?: unknown;
  direction?: unknown;
}>;

export type ConstructedCardFacets = {
  classes: string[];
  sets: string[];
  mechanics: string[];
  minionTypes: string[];
  spellSchools: string[];
  types: string[];
  rarities: string[];
};

export type ConstructedCardFacetCount = {
  value: string;
  count: number;
};

export type ConstructedCardFacetCounts = {
  classes: ConstructedCardFacetCount[];
  sets: ConstructedCardFacetCount[];
  mechanics: ConstructedCardFacetCount[];
  minionTypes: ConstructedCardFacetCount[];
  spellSchools: ConstructedCardFacetCount[];
  types: ConstructedCardFacetCount[];
  rarities: ConstructedCardFacetCount[];
};

export type ConstructedCardCatalogQueryPolicy = Readonly<{
  isPublicTerm: (value: unknown) => boolean;
}>;

export type ConstructedCardCatalogQueryModel = Readonly<{
  cardMechanics: (card: ConstructedCardCatalogQueryRecord) => string[];
  constructedCardFacetCounts: (
    cards: readonly ConstructedCardCatalogQueryRecord[],
  ) => ConstructedCardFacetCounts;
  constructedCardFacets: (
    cards: readonly ConstructedCardCatalogQueryRecord[],
  ) => ConstructedCardFacets;
  queryConstructedCards: <Card extends ConstructedCardCatalogQueryRecord>(
    cards: readonly Card[],
    query: ConstructedCardCatalogQueryInput,
  ) => Card[];
}>;

type UnknownRecord = Record<string, unknown>;

const EMPTY_RECORD: UnknownRecord = {};
const SORTS = new Set([
  'popularity', 'winrate', 'games', 'mana', 'attack', 'health', 'name', 'set', 'class', 'mechanics',
]);
const CONSTRUCTED_SET_RELEASE_ORDER = [
  'ESCAPEFROM_VIOLET_HOLD', 'CATACLYSM', 'TIME_TRAVEL', 'THE_LOST_CITY', 'EMERALD_DREAM',
  'SPACE', 'ISLAND_VACATION', 'WHIZBANGS_WORKSHOP', 'WILD_WEST', 'WONDERS', 'TITANS',
  'BATTLE_OF_THE_BANDS', 'RETURN_OF_THE_LICH_KING', 'PATH_OF_ARTHAS', 'REVENDRETH',
  'THE_SUNKEN_CITY', 'ALTERAC_VALLEY', 'STORMWIND', 'THE_BARRENS', 'DARKMOON_FAIRE',
  'SCHOLOMANCE', 'BLACK_TEMPLE', 'YEAR_OF_THE_DRAGON', 'DRAGONS', 'ULDUM', 'DALARAN',
  'TROLL', 'BOOMSDAY', 'GILNEAS', 'LOOTAPALOOZA', 'ICECROWN', 'UNGORO', 'GANGS',
  'KARA', 'OG', 'LOE', 'TGT', 'BRM', 'GVG', 'NAXX', 'DEMON_HUNTER_INITIATE',
  'EXPERT1', 'CORE', 'LEGACY', 'EVENT',
] as const;
const CONSTRUCTED_SET_RELEASE_INDEX = new Map<string, number>(
  CONSTRUCTED_SET_RELEASE_ORDER.map((set, index) => [set, index]),
);
const VALID_CLASSES = new Set([
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR', 'NEUTRAL', 'DREAM',
]);

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : EMPTY_RECORD;
}

function readFilter(value: unknown): string {
  return String(value ?? '').trim().slice(0, 120);
}

function readNumberFilter(value: unknown): number | null {
  const raw = readFilter(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cardName(card: ConstructedCardCatalogQueryRecord): unknown {
  const name = record(card.name);
  return name.ru ?? name.en;
}

function searchableText(card: ConstructedCardCatalogQueryRecord): string {
  const name = record(card.name);
  return [name.ru, name.en, card.card_id, card.slug]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru');
}

function cardMechanics(
  card: ConstructedCardCatalogQueryRecord,
  isPublicTerm: ConstructedCardCatalogQueryPolicy['isPublicTerm'],
): string[] {
  return [...new Set([
    ...(Array.isArray(card.mechanics) ? card.mechanics : []),
    ...(Array.isArray(card.referenced_tags) ? card.referenced_tags : []),
  ].map(value => String(value).trim()).filter(isPublicTerm))];
}

function cardClasses(card: ConstructedCardCatalogQueryRecord): string[] {
  return [...new Set([card.class, ...(Array.isArray(card.multi_class) ? card.multi_class : [])]
    .map(value => String(value ?? '').trim().toUpperCase())
    .filter(value => VALID_CLASSES.has(value)))];
}

function cardMinionTypes(card: ConstructedCardCatalogQueryRecord): string[] {
  return [...new Set([
    card.minion_type,
    ...(Array.isArray(card.minion_types) ? card.minion_types : []),
  ]
    .map(value => String(value ?? '').trim().toUpperCase())
    .filter(Boolean))];
}

function compareNullableNumbers(left: unknown, right: unknown, direction: number): number {
  const a = finiteNumber(left);
  const b = finiteNumber(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

function compareText(left: unknown, right: unknown, direction: number): number {
  return String(left ?? '').localeCompare(String(right ?? ''), 'ru', { sensitivity: 'base' }) * direction;
}

function compareSetRelease(left: unknown, right: unknown, direction: number): number {
  const leftSet = String(left ?? '').trim().toUpperCase();
  const rightSet = String(right ?? '').trim().toUpperCase();
  const releaseIndex = (set: string) => {
    if (!set) return Number.MAX_SAFE_INTEGER;
    // A newly released set may reach the catalog before this fallback list is
    // updated. Keep unknown named sets ahead of known historical expansions.
    return CONSTRUCTED_SET_RELEASE_INDEX.get(set) ?? -1;
  };
  return (releaseIndex(leftSet) - releaseIndex(rightSet)) * direction
    || compareText(leftSet, rightSet, direction);
}

function sortCards<Card extends ConstructedCardCatalogQueryRecord>(
  cards: readonly Card[],
  sort: string,
  direction: 'asc' | 'desc',
  isPublicTerm: ConstructedCardCatalogQueryPolicy['isPublicTerm'],
): Card[] {
  const numericDirection = direction === 'asc' ? 1 : -1;
  return [...cards].sort((left, right) => {
    const leftStats = record(left.stats);
    const rightStats = record(right.stats);
    let result = 0;
    if (sort === 'popularity') result = compareNullableNumbers(leftStats.deckPopularity, rightStats.deckPopularity, numericDirection);
    else if (sort === 'winrate') result = compareNullableNumbers(leftStats.deckWinrate, rightStats.deckWinrate, numericDirection);
    else if (sort === 'games') result = compareNullableNumbers(leftStats.timesPlayed, rightStats.timesPlayed, numericDirection);
    else if (sort === 'mana') result = compareNullableNumbers(left.mana_cost, right.mana_cost, numericDirection);
    else if (sort === 'attack') result = compareNullableNumbers(left.attack, right.attack, numericDirection);
    else if (sort === 'health') result = compareNullableNumbers(left.health, right.health, numericDirection);
    else if (sort === 'set') result = compareSetRelease(left.card_set, right.card_set, numericDirection);
    else if (sort === 'class') result = compareText(left.class, right.class, numericDirection);
    else if (sort === 'mechanics') {
      result = compareText(
        cardMechanics(left, isPublicTerm).join(' '),
        cardMechanics(right, isPublicTerm).join(' '),
        numericDirection,
      );
    } else result = compareText(cardName(left), cardName(right), numericDirection);
    return result || compareText(cardName(left), cardName(right), 1);
  });
}

function uniqueSorted(values: readonly unknown[]): string[] {
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ru', { sensitivity: 'base' }));
}

function countedValues(values: readonly unknown[]): ConstructedCardFacetCount[] {
  const counts = new Map<string, number>();
  for (const rawValue of values) {
    const value = String(rawValue ?? '').trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value, 'ru', { sensitivity: 'base' }));
}

function queryCards<Card extends ConstructedCardCatalogQueryRecord>(
  cards: readonly Card[],
  query: ConstructedCardCatalogQueryInput,
  isPublicTerm: ConstructedCardCatalogQueryPolicy['isPublicTerm'],
): Card[] {
  const search = readFilter(query.query).toLocaleLowerCase('ru');
  const className = readFilter(query.class).toUpperCase();
  const deckClass = readFilter(query.deckClass).toUpperCase();
  const cardSet = readFilter(query.set).toUpperCase();
  const mechanic = readFilter(query.mechanic).toUpperCase();
  const minionType = readFilter(query.minionType).toUpperCase();
  const spellSchool = readFilter(query.spellSchool).toUpperCase();
  const type = readFilter(query.type).toUpperCase();
  const rarity = readFilter(query.rarity).toUpperCase();
  const manaFilter = readFilter(query.mana).toUpperCase();
  const manaTenPlus = manaFilter === '10+';
  const mana = manaTenPlus ? null : readNumberFilter(query.mana);
  const attack = readNumberFilter(query.attack);
  const health = readNumberFilter(query.health);
  const sort = SORTS.has(String(query.sort)) ? String(query.sort) : 'set';
  const direction = query.direction === 'desc' ? 'desc' : 'asc';

  const filtered = cards.filter(card => {
    if (search && !searchableText(card).includes(search)) return false;
    const classes = cardClasses(card);
    if (deckClass && !classes.includes(deckClass) && !classes.includes('NEUTRAL')) return false;
    if (className && !classes.includes(className)) return false;
    if (cardSet && String(card.card_set ?? '').toUpperCase() !== cardSet) return false;
    if (mechanic && !cardMechanics(card, isPublicTerm).map(value => value.toUpperCase()).includes(mechanic)) return false;
    if (minionType && !cardMinionTypes(card).includes(minionType)) return false;
    if (spellSchool && String(card.spell_school ?? '').toUpperCase() !== spellSchool) return false;
    if (type && String(record(card.card_type).slug ?? '').toUpperCase() !== type) return false;
    if (rarity && String(card.rarity ?? '').toUpperCase() !== rarity) return false;
    if (manaTenPlus && (finiteNumber(card.mana_cost) ?? -1) < 10) return false;
    if (mana !== null && finiteNumber(card.mana_cost) !== mana) return false;
    if (attack !== null && finiteNumber(card.attack) !== attack) return false;
    if (health !== null && finiteNumber(card.health) !== health) return false;
    return true;
  });

  return sortCards(filtered, sort, direction, isPublicTerm);
}

function cardFacets(
  cards: readonly ConstructedCardCatalogQueryRecord[],
  isPublicTerm: ConstructedCardCatalogQueryPolicy['isPublicTerm'],
): ConstructedCardFacets {
  return {
    classes: uniqueSorted(cards.flatMap(cardClasses)),
    sets: uniqueSorted(cards.map(card => card.card_set)),
    mechanics: uniqueSorted(cards.flatMap(card => cardMechanics(card, isPublicTerm))),
    minionTypes: uniqueSorted(cards.flatMap(cardMinionTypes)),
    spellSchools: uniqueSorted(cards.map(card => card.spell_school)),
    types: uniqueSorted(cards.map(card => record(card.card_type).slug)),
    rarities: uniqueSorted(cards.map(card => card.rarity)),
  };
}

function cardFacetCounts(
  cards: readonly ConstructedCardCatalogQueryRecord[],
  isPublicTerm: ConstructedCardCatalogQueryPolicy['isPublicTerm'],
): ConstructedCardFacetCounts {
  return {
    classes: countedValues(cards.flatMap(cardClasses)),
    sets: countedValues(cards.map(card => card.card_set)),
    mechanics: countedValues(cards.flatMap(card => cardMechanics(card, isPublicTerm))),
    minionTypes: countedValues(cards.flatMap(cardMinionTypes)),
    spellSchools: countedValues(cards.map(card => card.spell_school)),
    types: countedValues(cards.map(card => record(card.card_type).slug)),
    rarities: countedValues(cards.map(card => card.rarity)),
  };
}

/** Creates the catalog query model with the player-facing term policy supplied by composition. */
export function createConstructedCardCatalogQuery(
  policy: ConstructedCardCatalogQueryPolicy,
): ConstructedCardCatalogQueryModel {
  const { isPublicTerm } = policy;
  return {
    cardMechanics: card => cardMechanics(card, isPublicTerm),
    constructedCardFacetCounts: cards => cardFacetCounts(cards, isPublicTerm),
    constructedCardFacets: cards => cardFacets(cards, isPublicTerm),
    queryConstructedCards: (cards, query) => queryCards(cards, query, isPublicTerm),
  };
}
