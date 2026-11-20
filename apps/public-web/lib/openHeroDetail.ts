import type {
  BattlegroundHeroDetailLibraryHero,
  BattlegroundHeroDetailStats,
} from '@/src/features/battlegroundHeroDetailTypes';
import type { PublicBattlegroundHero } from './publicBattlegroundHeroData';
import type { PublicBattlegroundHeroProfile } from './publicBattlegroundHeroProfile';
import { formatHeroFigure, type PublicBattlegroundHeroStats } from './publicBattlegroundHeroStats';

const WIKI_LABEL = 'Hearthstone Wiki';

/**
 * The open data of a hero in the shapes the subscriber's hero page reads (`BattlegroundHeroDetailView`): the hero row
 * of the base range (solo, or duos for a duos-only hero) and the hero library entry. Only open fields are mapped, so
 * the guest gets the subscriber's blocks with the open figures and the paid analytics stay locks.
 */
export function openHeroDetail(hero: PublicBattlegroundHero, stats: PublicBattlegroundHeroStats | null,
  profile: PublicBattlegroundHeroProfile | null): { stats: BattlegroundHeroDetailStats; libraryHero: BattlegroundHeroDetailLibraryHero } {
  const mode = stats?.modes.solo ? 'solo' : stats?.modes.duos ? 'duos' : null;
  const row = mode ? stats?.modes[mode] : undefined;
  const wikiPage = profile?.links.find(link => link.label === WIKI_LABEL)?.url ?? null;
  const card = (value: { name: string; text: string | null; image: string; imageGold?: string | null } | null) =>
    value ? { name: value.name, text: value.text, image: value.image, image_gold: value.imageGold ?? null } : null;
  return {
    stats: {
      mode,
      filters: { mmr_percentile: 'TOP_50_PERCENT' },
      hero: {
        hero: hero.name,
        tier: row?.tier ?? null,
        avg_placement: row?.avgPlacement ?? null,
        pick_rate: row?.pickRate == null ? null : `${formatHeroFigure(row.pickRate, 1)}%`,
        best_composition: row?.bestComposition ?? null,
      },
    },
    libraryHero: {
      dbf: hero.dbfId,
      card_id: hero.cardId,
      name: { ru: hero.name },
      images: { hero: hero.image, full_art: profile?.fullArt ?? null },
      hero_power: hero.heroPower ? { card: card({ ...hero.heroPower }) } : null,
      buddy: profile?.buddy ? { card: card(profile.buddy), golden: card(profile.buddy.golden) } : null,
      skins: profile?.skins.map(skin => ({ card_id: skin.cardId, title: skin.title, image: skin.image, url: skin.url })) ?? [],
      artist: profile?.artist ?? null,
      race: profile?.race ?? null,
      armor: profile?.armor ?? null,
      character: { description: profile?.description ?? null },
      wiki: {
        page: wikiPage ? { url: wikiPage } : null,
        external_links: profile?.links.filter(link => link.label !== WIKI_LABEL) ?? [],
        card_changes: profile?.patches ?? [],
      },
    },
  };
}
