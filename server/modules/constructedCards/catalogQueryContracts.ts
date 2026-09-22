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
