import { battlegroundFullCardImage, preferredBattlegroundHeroImage } from '../modules/battlegrounds/public';
import { bgDetailCardTooltipText } from './battlegroundTierListItems';
import type { BattlegroundHeroDetailCard, BattlegroundHeroDetailLibraryHero } from './battlegroundHeroDetailTypes';

export const BG_FALLBACK_ICON = '/arena-logo-icon.webp?v=mana-swirl-20260624';

function uniqueSources(sources: Array<string | null | undefined>): string[] {
  return [...new Set(sources.filter(Boolean) as string[])];
}

export function bgDetailCardText(card: BattlegroundHeroDetailCard, tone: 'normal' | 'gold' = 'normal'): string {
  if (!card) return '';
  const value = tone === 'gold'
    ? card?.text_gold || card?.textGold || card?.golden?.text || card?.text
    : card?.text;
  return bgDetailCardTooltipText(value);
}

export function bgDetailImageSources(...sources: Array<string | null | undefined>): string[] {
  return uniqueSources(sources.reduce<string[]>((acc, source) => {
    const value = String(source || '').trim();
    if (value) acc.push(value);
    return acc;
  }, []));
}

export function bgDetailCardSources(card: BattlegroundHeroDetailCard, tone: 'normal' | 'gold' = 'normal'): string[] {
  if (!card) return [];
  const primaryImage = tone === 'gold' ? card?.image_gold || card?.image : card?.image;
  return bgDetailImageSources(
    battlegroundFullCardImage(card?.card_id, primaryImage),
    tone === 'gold' ? card?.image_gold : null,
    card?.image,
    card?.image_gold,
  );
}

export function bgDetailArtSources(card: BattlegroundHeroDetailCard): string[] {
  if (!card) return [];
  return bgDetailImageSources(
    card?.crop_image,
    card?.cropImage,
    card?.art,
  );
}

const BG_HERO_POWER_FULL_ART_OVERRIDES: Record<string, string> = {
  '117426': 'https://hearthstone.wiki.gg/images/Final_Frontier_full.jpg?39a766',
  'Тайное знание': 'https://hearthstone.wiki.gg/images/Final_Frontier_full.jpg?39a766',
};

export function bgHeroPowerFullArtSources(card: BattlegroundHeroDetailCard): string[] {
  if (!card) return [];
  return bgDetailImageSources(
    BG_HERO_POWER_FULL_ART_OVERRIDES[String(card?.dbf || '')],
    BG_HERO_POWER_FULL_ART_OVERRIDES[String(card?.card_id || '')],
    BG_HERO_POWER_FULL_ART_OVERRIDES[String(card?.name || '')],
    card?.full_art,
    card?.fullArt,
    card?.full_image,
    card?.fullImage,
  );
}

export function bgHeroSkinLargeImage(image: unknown): string {
  const raw = String(image || '');
  if (!raw) return '';
  return raw.replace(/\/\d+px-/, '/720px-');
}

export function bgHeroDetailPortrait(
  libraryHero: BattlegroundHeroDetailLibraryHero | null | undefined,
  dbfId: string,
): string {
  return preferredBattlegroundHeroImage({
    cardId: libraryHero?.card_id,
    dbfId,
    libraryImage: libraryHero?.images?.hero === BG_FALLBACK_ICON ? '' : libraryHero?.images?.hero,
    fallback: BG_FALLBACK_ICON,
  });
}
