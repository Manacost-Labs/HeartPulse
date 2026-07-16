import { decode } from '@firestone-hs/deckstrings';

export type DeckCardData = {
  id: string;
  dbfId: number;
  name: string;
  cost: number;
  rarity: string;
  elite: boolean;
  count: number;
  image: string;
};

export type DeckCardCatalogRecord = Record<string, any>;

export function decodeDeckCardCounts(deckCode: string): Array<{ dbfId: number; count: number }> {
  if (!/^[A-Za-z0-9+/=]{40,}$/.test(String(deckCode ?? '').trim())) return [];
  try {
    const decoded = decode(deckCode.trim());
    return decoded.cards.flatMap(([rawDbfId, rawCount]) => {
      const dbfId = Number(rawDbfId);
      const count = Number(rawCount);
      return Number.isSafeInteger(dbfId) && dbfId > 0 && Number.isSafeInteger(count) && count > 0 && count <= 10
        ? [{ dbfId, count }]
        : [];
    });
  } catch {
    return [];
  }
}

export function buildDeckCardData(deckCode: string, catalogCards: DeckCardCatalogRecord[]): DeckCardData[] {
  const cardsByDbf = new Map(catalogCards.flatMap(card => {
    const dbfId = Number(card?.dbf ?? card?.dbfId);
    return Number.isSafeInteger(dbfId) && dbfId > 0 ? [[dbfId, card] as const] : [];
  }));
  return decodeDeckCardCounts(deckCode).flatMap(({ dbfId, count }) => {
    const card = cardsByDbf.get(dbfId);
    if (!card) return [];
    const id = String(card?.card_id ?? card?.id ?? '').trim();
    if (!id) return [];
    const rarity = String(card?.rarity ?? 'COMMON').toUpperCase();
    return [{
      id,
      dbfId,
      name: String(card?.name?.ru ?? card?.name_ru ?? card?.name?.en ?? card?.name ?? id),
      cost: Number.isFinite(Number(card?.mana_cost ?? card?.cost)) ? Number(card?.mana_cost ?? card?.cost) : 0,
      rarity,
      elite: rarity === 'LEGENDARY',
      count,
      image: String(card?.images?.crop ?? card?.crop_image ?? `https://art.hearthstonejson.com/v1/tiles/${encodeURIComponent(id)}.webp`),
    }];
  });
}
