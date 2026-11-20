import {
  preferredBattlegroundHeroImage,
  type BattlegroundHeroTierEntry,
  type BattlegroundHeroTierSection,
} from '@/src/modules/battlegrounds/public';
import type { PublicBattlegroundHeroesRanking } from './publicBattlegroundHeroesData';

const FALLBACK_ICON = '/arena-logo-icon.webp?v=mana-swirl-20260624';

// Every tier the open projection allows (`publicBattlegroundHeroesData.ts`), so no ranked hero drops out of the view.
export const OPEN_HERO_TIERS = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];

/** Figures written the way the subscriber's ranking writes the source strings (`4,27`, `52.71%`). */
function entry(hero: PublicBattlegroundHeroesRanking['heroes'][number]): BattlegroundHeroTierEntry {
  return {
    name: hero.name,
    dbfId: hero.dbfId,
    averagePlace: hero.avgPlacement.toFixed(2).replace('.', ','),
    popularity: hero.pickRate === null ? undefined : `${hero.pickRate.toFixed(2)}%`,
    image: preferredBattlegroundHeroImage({ dbfId: hero.dbfId, apiImage: hero.image, fallback: FALLBACK_ICON }),
    bestComposition: hero.bestComposition ?? undefined,
    heroPower: hero.heroPowerName
      ? { name: hero.heroPowerName, text: hero.heroPowerText ?? undefined, image: hero.heroPowerImage }
      : null,
  };
}

/** The open ranking as the tier sections of the subscriber's view, best tier first, the projection's order inside a tier. */
export function openHeroSections(ranking: PublicBattlegroundHeroesRanking | null): BattlegroundHeroTierSection[] {
  if (!ranking) return [];
  return OPEN_HERO_TIERS.flatMap(tier => {
    const heroes = ranking.heroes.filter(hero => hero.tier === tier).map(entry);
    return heroes.length ? [{ tier, title: `${tier} Тир`, heroes }] : [];
  });
}

