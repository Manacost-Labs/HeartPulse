// Ответы hs-data-api для меты HSGuru и каталога архетипов в его формате, для
// сквозных браузерных сценариев на `startPublicCardPilot({ externalRoutes })`.
// Настоящий бэкенд сам переводит, кеширует и закрывает их подпиской.

const FETCHED_AT = '2026-10-25T12:00:00Z';

/** Код колоды «Контроль Воина»: 15 карт по две из фикстуры карт, Стандарт. */
export const CONTROL_WARRIOR_DECK_CODE = 'AAECAQcAD7sC2AqinAGjnAGknAGlnAGmnAGnnAGonAGpnAGqnAGrnAGsnAGtnAGunAEAAA==';

const ARCHETYPES = [
  { archetype: 'Thief Priest', winrate: 55.1, popularity: 12.5, games: 31959 },
  { archetype: 'Control Warrior', winrate: 52.4, popularity: 8.5, games: 21000 },
  { archetype: 'Aggro Hunter', winrate: 50.3, popularity: 6.5, games: 15000 },
  { archetype: 'Big Druid', winrate: 48.0, popularity: 4.5, games: 9000 },
];

function meta() {
  return {
    meta: { fetched_at: FETCHED_AT, available_periods: ['past_day', 'past_3_days', 'past_week'] },
    data: {
      source_url: 'https://www.hsguru.com/meta',
      items: ARCHETYPES.map(row => ({ ...row, turns: 8, duration_minutes: 8, climbing_speed: 1 })),
    },
  };
}

function archetypes() {
  return {
    meta: { fetched_at: FETCHED_AT },
    criteria: { period: 'past_week', minimum_games: 50 },
    coverage: {},
    data: ARCHETYPES.map(row => ({
      archetype: row.archetype, games: row.games, winrate: row.winrate, popularity_pct: row.popularity,
      avg_turns: 8, avg_duration_minutes: 8, climbing_speed_stars_per_hour: 1,
      archetype_url: 'https://www.hsguru.com/archetype',
      decks: row.archetype === 'Control Warrior'
        ? [{ deck_code: CONTROL_WARRIOR_DECK_CODE, games: 2216, win_rate: 53.1, class: 'WARRIOR',
          url: 'https://www.hsguru.com/deck/1', updated_at: FETCHED_AT }]
        : [],
    })),
  };
}

/** `externalRoutes` для `startPublicCardPilot`. */
export const metaExternalRoutes = Object.freeze({
  '/v1/hsguru/meta': meta,
  '/v1/hsguru/archetypes': archetypes,
});
