import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import StandardMeta from '../../src/features/StandardMeta';
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
};

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const payload = url.includes('/wild/thief-priest') ? detail : catalog;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

function Harness() {
  const [path, setPath] = useState('/standard/meta');
  return <StandardMeta currentPath={path} navigatePath={setPath} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
