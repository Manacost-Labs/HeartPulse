import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ArchetypesPage from '../../src/features/Archetypes';
import '../../src/index.css';

const cards = [
  { dbf_id: 555, card_id: 'CORE_CS2_023', card_name: 'Чародейский интеллект', card_name_en: 'Arcane Intellect', cost: 3, card_type: 'SPELL', rarity: 'COMMON', count: 2, sideboard: 0 },
  { dbf_id: 662, card_id: 'CORE_CS2_024', card_name: 'Ледяная стрела', card_name_en: 'Frostbolt', cost: 2, card_type: 'SPELL', rarity: 'FREE', count: 2, sideboard: 0 },
  { dbf_id: 695, card_id: 'CORE_CS2_029', card_name: 'Огненный шар', card_name_en: 'Fireball', cost: 4, card_type: 'SPELL', rarity: 'FREE', count: 2, sideboard: 0 },
  { dbf_id: 1003, card_id: 'CORE_CS2_032', card_name: 'Волна огня', card_name_en: 'Flamestrike', cost: 7, card_type: 'SPELL', rarity: 'CORE', count: 2, sideboard: 0 },
  { dbf_id: 395, card_id: 'CORE_CS2_033', card_name: 'Элементаль воды', card_name_en: 'Water Elemental', cost: 4, card_type: 'MINION', rarity: 'FREE', count: 2, sideboard: 0 },
  { dbf_id: 315, card_id: 'CORE_EX1_289', card_name: 'Ледяная преграда', card_name_en: 'Ice Barrier', cost: 3, card_type: 'SPELL', rarity: 'COMMON', count: 2, sideboard: 0 },
];

const mulligan = Array.from({ length: 8 }, (_, index) => ({
  ...cards[index % cards.length],
  dbf_id: cards[index % cards.length].dbf_id + index * 10_000,
  hsreplay_rank: index + 1,
  keep_percentage: 68.2 - index * 3.1,
  opening_hand_winrate: 55.8 - index * 0.4,
  winrate_when_drawn: 53.4 - index * 0.25,
  winrate_when_played: 58.9 - index * 0.2,
  times_presented_in_initial_cards: 18_420 - index * 740,
  times_kept: 12_562 - index * 610,
  times_card_drawn: 9_450 - index * 380,
  times_card_played: 7_820 - index * 310,
  avg_turn_played_on: 2.4 + index * 0.55,
}));

const detail = {
  snapshot: {
    name: 'Elemental Mage',
    nameRu: 'Маг на элементалях',
    canonicalNameEn: 'Burn Mage',
    canonicalNameRu: 'Берн Маг',
    identitySource: 'hsguru',
    identityConfidence: 1,
    player_class: 'MAGE',
    region: 'REGION_EU',
    rank_range: 'LEGEND',
    mulligan_time_range: 'LAST_30_DAYS',
    win_rate: 53.84,
    total_games: 48_219,
    pct_of_total: 8.41,
    as_of_popularity: '2026-07-24T12:00:00.000Z',
  },
  mulligan,
  matchups: [
    { opponent_archetype_id: 1, opponent_name: 'Контроль Воин', opponent_class: 'WARRIOR', win_rate: 58.4, total_games: 4321 },
    { opponent_archetype_id: 2, opponent_name: 'Агро Охотник', opponent_class: 'HUNTER', win_rate: 54.1, total_games: 6218 },
    { opponent_archetype_id: 3, opponent_name: 'Миракл Разбойник', opponent_class: 'ROGUE', win_rate: 50.2, total_games: 3840 },
    { opponent_archetype_id: 4, opponent_name: 'Дракон Жрец', opponent_class: 'PRIEST', win_rate: 49.1, total_games: 2937 },
    { opponent_archetype_id: 5, opponent_name: 'Токен Друид', opponent_class: 'DRUID', win_rate: 46.7, total_games: 5480 },
    { opponent_archetype_id: 6, opponent_name: 'Чумной Рыцарь смерти', opponent_class: 'DEATHKNIGHT', win_rate: 43.9, total_games: 4112 },
  ],
  decks: Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    deck_id: `fixture-${index + 1}`,
    url: 'https://hsreplay.net/decks/',
    total_games: 8_420 - index * 720,
    win_rate: 56.1 - index * 0.65,
    avg_num_player_turns: 8.2 + index * 0.15,
    card_count: 12,
    cards,
  })),
  history: [
    { series_name: 'winrates_over_time', point_date: '2026-07-21', value: 52.2 },
    { series_name: 'winrates_over_time', point_date: '2026-07-22', value: 52.9 },
    { series_name: 'winrates_over_time', point_date: '2026-07-23', value: 53.4 },
    { series_name: 'winrates_over_time', point_date: '2026-07-24', value: 53.84 },
    { series_name: 'popularity_over_time', point_date: '2026-07-21', value: 6.4 },
    { series_name: 'popularity_over_time', point_date: '2026-07-22', value: 7.1 },
    { series_name: 'popularity_over_time', point_date: '2026-07-23', value: 7.8 },
    { series_name: 'popularity_over_time', point_date: '2026-07-24', value: 8.41 },
  ],
};

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const payload = url.includes('/api/admin/archetypes/856')
    ? { format: 'standard', available: true, data: detail }
    : {
        count: 1,
        translated: 1,
        items: [{
          id: 856,
          nameEn: 'Burn Mage',
          nameRu: 'Берн Маг',
          sourceNameEn: 'HSReplay Mage',
          translated: true,
          classKey: 'MAGE',
          classLabel: 'Маг',
          url: null,
          standard: true,
          stats: {
            winRate: 53.84,
            totalGames: 48_219,
            games: 48_219,
            popularity: 8.41,
            turns: 8.2,
            durationMinutes: null,
            climbingSpeed: null,
          },
        }],
      };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArchetypesPage
      isAdmin
      authChecking={false}
      currentPath={new URLSearchParams(window.location.search).has('catalog') ? '/archetypes/' : '/archetypes/856/'}
    />
  </StrictMode>,
);
