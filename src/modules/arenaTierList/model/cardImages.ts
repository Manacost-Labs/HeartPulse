import type { CardData } from './types';

/** Blizzard's hero image is a portrait. Use a complete playable-card render instead. */
export function arenaCardImageSources(card: CardData, fallbacks: Array<string | null | undefined>, size: '256x' | '512x' = '256x'): string[] {
  const hero = card.type?.toLowerCase() === 'hero' || card.cardId === 'CATA_190h';
  const sources = hero ? [
    card.imageHa,
    `/api/public-resource/hsjson/v1/render/latest/ruRU/${size}/${encodeURIComponent(card.cardId)}.png?v=hero_card_v1`,
    `/api/public-resource/hsjson/v1/render/latest/enUS/${size}/${encodeURIComponent(card.cardId)}.png?v=hero_card_v1`,
  ] : fallbacks;
  return [...new Set(sources.filter((source): source is string => Boolean(source)))];
}
