import type { ConstructedCardFormat } from './serviceContracts.js';

export type CatalogCardMedia = { tile?: string | null; artwork?: string | null; fullArtwork?: string | null; rarity?: string | null };

/** An unavailable media catalog must not hide existing archetype statistics. */
export async function loadCatalogCardMedia(
  format: ConstructedCardFormat,
  loadCards?: (format: ConstructedCardFormat) => Promise<{ cards: Record<string, unknown>[] }>,
  onError?: (error: unknown) => void,
): Promise<Record<string, unknown>[]> {
  try {
    return (await loadCards?.(format))?.cards ?? [];
  } catch (error) {
    onError?.(error);
    return [];
  }
}

type CardIdentity = { cardId: string | null; dbfId: number | null };

/** Adds public provider media without mutating protected statistics or the catalog. */
export function withCatalogCardMedia<T extends CardIdentity>(rows: T[], cards: Record<string, unknown>[]) {
  const byId = new Map(cards.map(card => [card.card_id, card] as const));
  const byDbf = new Map(cards.map(card => [card.dbf, card] as const));
  return rows.map(row => {
    const card = (row.cardId ? byId.get(row.cardId) : undefined)
      ?? (row.dbfId === null ? undefined : byDbf.get(row.dbfId))
      // Core reissues have new IDs/DBFs, while statistics may retain the original edition.
      ?? (row.cardId ? byId.get(row.cardId.startsWith('CORE_') ? row.cardId.slice(5) : `CORE_${row.cardId}`) : undefined);
    const images = card?.images as Record<string, unknown> | undefined;
    return {
      ...row,
      tile: typeof images?.tile === 'string' ? images.tile : null,
      artwork: typeof images?.horizontal === 'string' ? images.horizontal : null,
      fullArtwork: typeof images?.art === 'string' ? images.art : null,
      rarity: typeof card?.rarity === 'string' ? card.rarity : null,
    };
  });
}
