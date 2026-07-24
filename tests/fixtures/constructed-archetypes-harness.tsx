import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ConstructedArchetypes from '../../src/features/ConstructedArchetypes';
import '../../src/index.css';

const builds = Array.from({ length: 14 }, (_, index) => ({
  deckCode: `AAEBAa0GFixtureDeckCode${String(index + 1).padStart(2, '0')}abcdefghijklmnopqrstuvwxyz`,
  games: 2_216 - index * 91,
  winrate: 57.1 + (index % 5),
  sourceUrl: 'https://www.hsguru.com/deck/40919030',
  updatedAt: '2026-07-24T12:38:57.727Z',
  classKey: 'priest',
  sampleRank: 'all',
  samplePeriod: 'past_30_days',
}));

const item = {
  slug: 'thief-priest',
  archetype: 'Thief Priest',
  archetypeLabel: 'Воровской Жрец',
  translated: true,
  classKey: 'priest',
  format: 'wild',
  games: 31_959,
  winrate: 58.3,
  popularity: 13.5,
  turns: 7.9,
  durationMinutes: 8,
  climbingSpeed: 1.24,
  deckCount: builds.length,
  builds,
  sourceUrl: 'https://www.hsguru.com/meta',
};

const catalog = {
  format: 'wild',
  formatLabel: 'Вольный',
  patch: '36.0.3',
  minimumGames: 50,
  updatedAt: '2026-07-24T12:38:57.727Z',
  coverage: {},
  items: [
    item,
    { ...item, slug: 'quest-mage', archetype: 'Quest Mage', archetypeLabel: 'Квест Маг', classKey: 'mage', games: 18_404, winrate: 52.4, popularity: 7.8, deckCount: 8, builds: builds.slice(0, 8) },
    { ...item, slug: 'pirate-rogue', archetype: 'Pirate Rogue', archetypeLabel: 'Пират Разбойник', classKey: 'rogue', games: 12_109, winrate: 50.8, popularity: 5.1, deckCount: 5, builds: builds.slice(0, 5) },
  ],
};

const detail = {
  format: 'wild',
  formatLabel: 'Вольный',
  patch: '36.0.3',
  minimumGames: 50,
  updatedAt: '2026-07-24T12:38:57.727Z',
  item,
  history: [
    { recordedAt: '2026-07-22T00:00:00.000Z', games: 21_200, winrate: 55.9, popularity: 11.4, turns: 8.1, durationMinutes: 8.4, climbingSpeed: 1.02 },
    { recordedAt: '2026-07-22T12:00:00.000Z', games: 24_800, winrate: 56.8, popularity: 12.1, turns: 8, durationMinutes: 8.2, climbingSpeed: 1.1 },
    { recordedAt: '2026-07-23T00:00:00.000Z', games: 28_100, winrate: 57.6, popularity: 12.8, turns: 7.9, durationMinutes: 8.1, climbingSpeed: 1.18 },
    { recordedAt: '2026-07-24T12:00:00.000Z', games: 31_959, winrate: 58.3, popularity: 13.5, turns: 7.9, durationMinutes: 8, climbingSpeed: 1.24 },
  ],
  analysis: {
    rank: 'legend',
    period: 'past_week',
    state: 'ok',
    updatedAt: '2026-07-24T12:38:57.727Z',
    matchupsUpdatedAt: '2026-07-24T12:38:57.727Z',
    cardStatsUpdatedAt: '2026-07-24T12:39:11.727Z',
    sourceUrls: {
      matchups: 'https://www.hsguru.com/archetype/Thief%20Priest?rank=legend',
      cards: 'https://www.hsguru.com/card-stats?archetype=Thief+Priest&rank=legend&show_counts=yes',
    },
    classMatchups: [
      { classKey: 'warrior', classLabel: 'Воин', winrate: 43.8, games: 1_086, share: 7.9 },
      { classKey: 'demonhunter', classLabel: 'Охотник на демонов', winrate: 46.2, games: 1_941, share: 14.2 },
      { classKey: 'hunter', classLabel: 'Охотник', winrate: 48.9, games: 1_436, share: 10.5 },
      { classKey: 'rogue', classLabel: 'Разбойник', winrate: 49.7, games: 1_792, share: 13.1 },
      { classKey: 'deathknight', classLabel: 'Рыцарь смерти', winrate: 50.3, games: 1_168, share: 8.5 },
      { classKey: 'priest', classLabel: 'Жрец', winrate: 51.1, games: 1_593, share: 11.6 },
      { classKey: 'shaman', classLabel: 'Шаман', winrate: 52.4, games: 1_015, share: 7.4 },
      { classKey: 'mage', classLabel: 'Маг', winrate: 54.8, games: 1_327, share: 9.7 },
      { classKey: 'paladin', classLabel: 'Паладин', winrate: 56.1, games: 702, share: 5.1 },
      { classKey: 'druid', classLabel: 'Друид', winrate: 58.4, games: 938, share: 6.8 },
      { classKey: 'warlock', classLabel: 'Чернокнижник', winrate: 61.7, games: 721, share: 5.2 },
    ],
    cardStats: Array.from({ length: 18 }, (_, index) => {
      const cards = [
        { id: 'JAIL_732', dbfId: 126_662, name: 'Душа Бездны', cost: 1 },
        { id: 'JAIL_733', dbfId: 126_663, name: 'Злобный пусточешуйник', cost: 3 },
        { id: 'TLC_603', dbfId: 117_719, name: 'Клювозавр', cost: 1 },
        { id: 'JAIL_730', dbfId: 126_660, name: 'Коса звёздной пыли', cost: 2 },
        { id: 'EDR_840', dbfId: 114_654, name: 'Мрачная жатва', cost: 2 },
        { id: 'SW_072', dbfId: 64_720, name: 'Гадюка Ржавого Гнилья', cost: 3 },
      ];
      const card = cards[index % cards.length];
      return {
      cardId: card.id,
      dbfId: card.dbfId,
      cardName: card.name,
      cost: card.cost,
      mulliganImpact: 6.8 - index * 0.62,
      mulliganCount: 3_480 - index * 91,
      drawnImpact: 4.9 - index * 0.51,
      drawnCount: 4_210 - index * 103,
      keptImpact: 7.4 - index * 0.69,
      keptCount: 2_760 - index * 77,
    };
    }),
  },
};

const resolvedDeck = {
  ok: true,
  format: 'wild',
  deckCode: builds[0].deckCode,
  totalCards: 30,
  deckSizeLimit: 30,
  cards: Array.from({ length: 8 }, (_, index) => ({
    id: `FIXTURE_${index + 1}`,
    dbfId: 90_000 + index,
    name: ['Дар видений', 'Теневой вор', 'Украденная реликвия', 'Мастер иллюзий'][index % 4],
    cost: index % 7,
    rarity: index === 0 ? 'LEGENDARY' : index % 3 === 0 ? 'RARE' : 'COMMON',
    elite: index === 0,
    count: index === 0 ? 1 : 2,
    image: '',
    cardImage: '',
    sideboardKeyDbfId: null,
  })),
  sideboards: [],
};

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const payload = url.includes('/api/deck/resolve')
    ? { ...resolvedDeck, deckCode: new URL(url, window.location.origin).searchParams.get('code') }
    : url.includes('/wild/thief-priest')
      ? detail
      : catalog;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

function Harness() {
  const [path, setPath] = useState('/standard/archetypes');
  return <ConstructedArchetypes currentPath={path} navigatePath={setPath} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
