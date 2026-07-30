type JsonRecord = Record<string, any>;

function catalogByCardId(cards: JsonRecord[]): Map<string, JsonRecord> {
  return new Map(
    cards
      .map(card => [String(card?.card_id ?? '').trim().toUpperCase(), card] as const)
      .filter(([cardId]) => Boolean(cardId)),
  );
}

/** Enriches generated pools with localized catalog records when available. */
export function enrichConstructedCardPools(detail: JsonRecord, catalogCards: JsonRecord[]): JsonRecord {
  const pools = detail?.wiki?.generated_card_pools;
  if (!Array.isArray(pools)) return detail;

  const cardsById = catalogByCardId(catalogCards);
  const generatedCardPools = pools.map((pool: JsonRecord) => {
    const rawCards = Array.isArray(pool?.cards) ? pool.cards : [];
    const cardIds = Array.isArray(pool?.card_ids) ? pool.card_ids : [];
    const items = rawCards.length > 0 ? rawCards : cardIds.map((cardId: unknown) => ({ card_id: cardId }));
    const seen = new Set<string>();
    const cards = items.flatMap((item: JsonRecord) => {
      const cardId = String(item?.card_id ?? item?.id ?? '').trim();
      const key = cardId.toUpperCase();
      if (!cardId || seen.has(key)) return [];
      seen.add(key);
      const catalogCard = cardsById.get(key);
      return [{
        ...item,
        card_id: cardId,
        name: catalogCard?.name ?? item?.name ?? { ru: null, en: item?.title ?? null },
        images: catalogCard?.images ?? item?.images,
        image_url: catalogCard?.images?.card ?? item?.image_url ?? item?.image ?? null,
        can_open: Boolean(catalogCard),
      }];
    });
    return { ...pool, cards };
  });

  return { ...detail, wiki: { ...detail.wiki, generated_card_pools: generatedCardPools } };
}

/** Preserves wiki relation groups and emits the localized card-page contract. */
export function enrichConstructedRelatedCards(detail: JsonRecord, catalogCards: JsonRecord[]): JsonRecord {
  const related = detail?.wiki?.related_cards;
  if (!Array.isArray(related)) return detail;

  const cardsById = catalogByCardId(catalogCards);
  const seen = new Set<string>();
  const enrichCard = (item: JsonRecord) => {
    const cardId = String(item?.card_id ?? item?.id ?? '').trim();
    const catalogCard = cardId ? cardsById.get(cardId.toUpperCase()) : undefined;
    const imageUrl = catalogCard?.images?.card ?? item?.image_url ?? item?.image ?? null;
    const rawName = catalogCard?.name ?? item?.name ?? null;
    const name = rawName && typeof rawName === 'object'
      ? rawName
      : { ru: null, en: String(rawName ?? '').trim() || null };
    const title = String(item?.name_ru ?? item?.title ?? name?.ru ?? name?.en ?? cardId).trim();
    const url = String(item?.url ?? '').trim() || null;
    if (!cardId && !title && !imageUrl && !url) return [];
    const key = (cardId || url || `${title}|${imageUrl ?? ''}`).toUpperCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      ...item,
      card_id: cardId || null,
      name,
      name_ru: String(name?.ru ?? item?.name_ru ?? '').trim() || null,
      image_url: imageUrl,
      can_open: Boolean(catalogCard),
    }];
  };

  const hasGroups = related.some((item: JsonRecord) => Array.isArray(item?.cards));
  if (!hasGroups) {
    return { ...detail, wiki: { ...detail.wiki, related_cards: related.flatMap(enrichCard) } };
  }

  const groups = related.flatMap((group: JsonRecord) => {
    if (!Array.isArray(group?.cards)) return [];
    const cards = group.cards.flatMap((item: JsonRecord) => enrichCard(item));
    return cards.length > 0 ? [{ ...group, cards }] : [];
  });
  const localizedGroups = groups.map((group: JsonRecord) => ({
    heading: {
      ru: String(group?.heading_ru ?? '').trim() || null,
      en: String(group?.heading ?? '').trim() || null,
    },
    cards: group.cards,
  }));
  const existingLocalized = Array.isArray(detail?.related_cards_localized)
    && detail.related_cards_localized.length > 0
    ? detail.related_cards_localized
    : localizedGroups;

  return {
    ...detail,
    related_cards_localized: existingLocalized,
    wiki: { ...detail.wiki, related_cards: groups },
  };
}
