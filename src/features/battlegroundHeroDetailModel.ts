import type { HeroAnalyticsCard } from '../modules/battlegrounds/public';
import { battlegroundHeroPatchEntries } from './battlegroundHeroPatchChanges';
import {
  BG_FALLBACK_ICON,
  bgDetailArtSources,
  bgDetailCardSources,
  bgDetailCardText,
  bgHeroDetailPortrait,
  bgHeroPowerFullArtSources,
  bgHeroSkinLargeImage,
} from './battlegroundHeroDetailMedia';
import { bgHeroBuddySoundGroups, bgHeroDescriptionRu, bgHeroExternalLinks } from './battlegroundHeroDetailText';
import { bgDetailCardTooltipText } from './battlegroundTierListItems';
import type {
  BattlegroundHeroDetailCard,
  BattlegroundHeroDetailHeroStats,
  BattlegroundHeroDetailLibraryHero,
  BattlegroundHeroMediaItem,
} from './battlegroundHeroDetailTypes';

type BattlegroundHeroDetailCards = {
  heroPower: BattlegroundHeroDetailCard | null | undefined;
  buddy: BattlegroundHeroDetailCard | null | undefined;
  goldenBuddyCard: BattlegroundHeroDetailCard | null;
};

/** The hero power and buddy cards under the hero name, in the order the lightbox pages through them. */
function bgHeroCardMediaItems(
  dbfId: string,
  hero: BattlegroundHeroDetailHeroStats,
  { heroPower, buddy, goldenBuddyCard }: BattlegroundHeroDetailCards,
): BattlegroundHeroMediaItem[] {
  return [
    heroPower && {
      key: `hero-power-${dbfId}`,
      title: heroPower.name || 'Сила героя',
      image: bgDetailCardSources(heroPower)[0] || '',
      kicker: 'Сила героя',
      meta: hero.tier ? `Тир ${hero.tier} · выбор ${hero.pick_rate || '—'}` : undefined,
      text: bgDetailCardText(heroPower),
    },
    buddy && {
      key: `hero-buddy-${dbfId}`,
      title: buddy.name || 'Компаньон',
      image: bgDetailCardSources(buddy)[0] || '',
      kicker: 'Компаньон',
      meta: hero.best_composition ? `Лучший состав: ${hero.best_composition}` : undefined,
      text: bgDetailCardText(buddy),
    },
    goldenBuddyCard && {
      key: `hero-golden-buddy-${dbfId}`,
      title: goldenBuddyCard.name || 'Золотой компаньон',
      image: bgDetailCardSources(goldenBuddyCard, 'gold')[0] || '',
      kicker: 'Золотой компаньон',
      meta: hero.best_composition ? `Лучший состав: ${hero.best_composition}` : undefined,
      text: bgDetailCardText(goldenBuddyCard, 'gold'),
    },
  ].flatMap(item => item ? [item] : []);
}

/** The art of the hero, its power and its buddy for the gallery; an entry without an image is left out. */
function bgHeroGalleryMediaItems(
  dbfId: string,
  heroName: string,
  fullArt: string,
  libraryHero: BattlegroundHeroDetailLibraryHero,
  { heroPower, buddy }: BattlegroundHeroDetailCards,
): BattlegroundHeroMediaItem[] {
  return [
    {
      key: `gallery-hero-art-${dbfId}`,
      title: heroName,
      image: fullArt,
      kicker: 'Арт героя',
      meta: libraryHero?.artist ? `Художник: ${libraryHero.artist}` : undefined,
      text: bgHeroDescriptionRu(heroName, libraryHero?.description),
    },
    heroPower && {
      key: `gallery-hero-power-art-${dbfId}`,
      title: heroPower.name || 'Сила героя',
      image: bgHeroPowerFullArtSources(heroPower)[0] || bgDetailCardSources(heroPower)[0] || '',
      kicker: 'Арт силы героя',
      text: bgDetailCardText(heroPower),
    },
    buddy && {
      key: `gallery-buddy-art-${dbfId}`,
      title: buddy.name || 'Компаньон',
      image: bgDetailArtSources(buddy)[0] || bgDetailCardSources(buddy)[0] || '',
      kicker: 'Арт компаньона',
      text: bgDetailCardText(buddy),
    },
  ].flatMap(item => item && item.image ? [item] : []);
}

/** Everything the hero detail view derives from a loaded payload; pure, so a server render gets the same values. */
export function bgHeroDetailModel(
  dbfId: string,
  hero: BattlegroundHeroDetailHeroStats,
  libraryHero: BattlegroundHeroDetailLibraryHero,
  cards: Record<string, HeroAnalyticsCard>,
) {
  const heroName = libraryHero?.name?.ru || hero.hero || 'Герой';
  const heroImage = bgHeroDetailPortrait(libraryHero, dbfId);
  const fullArt = libraryHero?.images?.full_art === BG_FALLBACK_ICON ? heroImage : libraryHero?.images?.full_art || heroImage;
  const heroPower = libraryHero?.hero_power?.card;
  const buddy = libraryHero?.buddy?.card;
  const goldenBuddy = libraryHero?.buddy?.golden;
  const goldenBuddyCard = goldenBuddy
    ? {
        ...goldenBuddy,
        image_gold: goldenBuddy.image_gold || buddy?.image_gold || null,
      }
    : null;
  const detailCards = { heroPower, buddy, goldenBuddyCard };
  const skins = Array.isArray(libraryHero?.skins) ? libraryHero.skins : [];
  const skinMediaItems = skins.flatMap(skin => {
    const image = bgHeroSkinLargeImage(skin.image);
    return image ? [{
      key: `skin-${skin.card_id || skin.title}`,
      title: skin.title || 'Скин героя',
      image,
      kicker: 'Скин героя',
      meta: heroName,
      link: skin.url || '',
    }] : [];
  });
  return {
    heroName,
    heroImage,
    fullArt,
    ...detailCards,
    skins,
    externalLinks: bgHeroExternalLinks(libraryHero, heroName),
    patchEntries: battlegroundHeroPatchEntries(libraryHero?.wiki?.card_changes),
    heroMediaItems: bgHeroCardMediaItems(dbfId, hero, detailCards),
    galleryMediaItems: bgHeroGalleryMediaItems(dbfId, heroName, fullArt, libraryHero, detailCards),
    buddySoundGroups: bgHeroBuddySoundGroups(buddy, goldenBuddyCard),
    skinMediaItems,
    // Card texts carry the English original and the mechanics list; the hover titles show only the Russian text.
    analyticsCards: Object.fromEntries(Object.entries(cards).map(([dbf, card]) => [dbf, { ...card, text: bgDetailCardTooltipText(card?.text) }])),
  };
}

export type BattlegroundHeroDetailModel = ReturnType<typeof bgHeroDetailModel>;
