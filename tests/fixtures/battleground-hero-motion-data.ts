const heroImage = '/bg-legacy/heroes_bg/Alexstrasza.png';
const powerImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%2375405a"/%3E%3C/svg%3E';
const buddyImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%235b718f"/%3E%3C/svg%3E';
const goldenBuddyImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%23d9ab49"/%3E%3C/svg%3E';
const goldenWikiPortrait = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="500" height="650"%3E%3Crect width="500" height="650" fill="%238f536d"/%3E%3C/svg%3E';
const power = { card_id: 'TB_BaconShop_HP_042', name: 'Королева драконов', image: powerImage, text: 'После улучшения таверны до 5 уровня вы раскапываете двух драконов.' };
const buddy = { card_id: 'TB_BaconShop_HERO_56_Buddy', name: 'Валестраз', image: buddyImage, image_gold: goldenBuddyImage, text: 'Боевой клич: вы получаете дракона.' };
const goldenBuddy = { card_id: 'TB_BaconShop_HERO_56_Buddy_G', name: 'Валестраз', image: goldenWikiPortrait, image_gold: goldenBuddyImage, text: 'Боевой клич: вы получаете двух драконов.' };

export const heroMotionDetail = {
  ok: true,
  fetched_at: '2026-09-10T12:00:00.000Z',
  stats: {
    hero: { hero: 'Алекстраза', dbfId: 61488, tier: 'A', avg_placement: 4.2, pick_rate: '12%', best_composition: 'Драконы', placement_distribution: ['18%', '16%', '14%', '13%', '12%', '10%', '9%', '8%'] },
    hero_power_by_turn: [{ turn: 3, invoked_rate: 61, total_data_points: 120 }, { turn: 4, invoked_rate: 72, total_data_points: 110 }],
    hero_power: [{ turn: 3, tavern_tier: 2, gold: 6, invoked_rate: 61, times_invoked: 90, total_data_points: 120 }],
    tavern_up_by_turn: [{ turn: 3, recommended_tavern_tier: 2, pct_at_tier: 64 }],
    tavern_up: [{ turn: 3, tavern_tier: 2, pct_at_tier: 64 }],
    compositions: [{ name: 'Драконы', avg_placement: 4.1, popularity: '11%', num_games: 120 }],
    best_composition: { name: 'Драконы', final_form_minions: [] },
  },
  libraryHero: {
    name: { ru: 'Алекстраза', en: 'Alexstrasza' },
    images: { hero: heroImage, full_art: heroImage },
    hero_power: { card: power },
    buddy: { card: buddy, golden: goldenBuddy },
    armor: { normal: 10, duos: 8 },
  },
  cards: {},
};

export const heroMotionApis: Record<string, unknown> = {
  '/api/bg/heroes/61488/details': heroMotionDetail,
  '/api/bg/heroes/61489/details': { ...heroMotionDetail, stats: { hero: { ...heroMotionDetail.stats.hero, placement_distribution: [] } } },
  '/api/bg/heroes': { ok: true, view: { heroes: [{ ...heroMotionDetail.stats.hero, image: heroImage, hero_power: { card: power } }] } },
  '/api/bg/library/extra/heroes': { data: [{ dbf: 61488, ...heroMotionDetail.libraryHero }] },
  '/api/bg/heroes/compositions': { ok: true, compositions: {}, composition_names: {} },
};
