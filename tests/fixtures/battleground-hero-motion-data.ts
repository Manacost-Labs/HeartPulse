import { heroDetailCards, heroDetailStats, heroDetailWiki } from './battleground-hero-detail-stats';

const heroImage = '/bg-legacy/heroes_bg/Alexstrasza.png';
const powerImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%2375405a"/%3E%3C/svg%3E';
const buddyImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%235b718f"/%3E%3C/svg%3E';
const goldenBuddyImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%23d9ab49"/%3E%3C/svg%3E';
const goldenWikiPortrait = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="500" height="650"%3E%3Crect width="500" height="650" fill="%238f536d"/%3E%3C/svg%3E';
const power = { card_id: 'TB_BaconShop_HP_042', name: 'Королева драконов', image: powerImage, text: 'После улучшения таверны до 5 уровня вы раскапываете двух драконов.' };
const buddy = { card_id: 'TB_BaconShop_HERO_56_Buddy', name: 'Валестраз', image: buddyImage, image_gold: goldenBuddyImage, text: 'Боевой клич: вы получаете дракона.' };
const goldenBuddy = { card_id: 'TB_BaconShop_HERO_56_Buddy_G', name: 'Валестраз', image: goldenWikiPortrait, image_gold: goldenBuddyImage, text: 'Боевой клич: вы получаете двух драконов.' };

// A framed-card placeholder per minion, tinted by its tavern tier, instead of a network image.
const cardImage = (tier: number) => `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect x="56" y="40" width="400" height="696" rx="190" fill="%23${['8d6a48', '7d6b5a', '6f7f68', '5f7591', '7c5d8f', 'a0523d', 'b2813a'][tier] ?? '8d6a48'}"/%3E%3C/svg%3E`;
const cards = Object.fromEntries(Object.entries(heroDetailCards).map(([dbf, card]) => [dbf, { ...card, image: cardImage(card.tavern_tier) }]));

export const heroMotionDetail = {
  ok: true,
  fetched_at: '2026-09-10T12:00:00.000Z',
  stats: {
    hero: { hero: 'Алекстраза', dbfId: 61488, tier: 'A', avg_placement: 4.2, pick_rate: '12%', best_composition: 'Драконы', placement_distribution: ['18%', '16%', '14%', '13%', '12%', '10%', '9%', '8%'] },
    mode: 'solo',
    filters: { mmr_percentile: 'TOP_50_PERCENT', time_range: 'CURRENT_BATTLEGROUNDS_PATCH' },
    tavern_up: heroDetailStats.tavern_up,
    tavern_up_by_turn: heroDetailStats.tavern_up_by_turn,
    hero_power: heroDetailStats.hero_power,
    hero_power_by_turn: heroDetailStats.hero_power_by_turn,
    combat_winrate: heroDetailStats.combat_winrate,
    compositions: heroDetailStats.compositions,
    best_composition: heroDetailStats.best_composition,
  },
  libraryHero: {
    name: { ru: 'Алекстраза', en: 'Alexstrasza' },
    images: { hero: heroImage, full_art: heroImage },
    hero_power: { card: power },
    buddy: { card: buddy, golden: goldenBuddy },
    armor: { normal: 8, duos: 6 },
    race: 'Dragon',
    artist: 'Raymond Swanland',
    wiki: heroDetailWiki,
  },
  cards,
};

export const heroMotionApis: Record<string, unknown> = {
  '/api/bg/heroes/61488/details': heroMotionDetail,
  '/api/bg/heroes/61489/details': { ...heroMotionDetail, stats: { hero: { ...heroMotionDetail.stats.hero, placement_distribution: [] } } },
  '/api/bg/heroes': { ok: true, fetched_at: '2026-09-22T12:00:00Z', view: { heroes: [{ ...heroMotionDetail.stats.hero, image: heroImage, hero_power: { card: power } }] } },
  '/api/bg/library/extra/heroes': { data: [{ dbf: 61488, ...heroMotionDetail.libraryHero }] },
  '/api/bg/heroes/compositions': { ok: true, compositions: {}, composition_names: {} },
};
