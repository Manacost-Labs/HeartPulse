import React from 'react';
import { createRoot } from 'react-dom/client';
import ViciousSyndicateGold from '../../src/features/ViciousSyndicateGold';
import '../../src/index.css';

const summary = {
  title: 'Vicious Syndicate Gold',
  format: 'Standard',
  games: 345678,
  source: 'Vicious Syndicate Live',
  sourceUrl: 'https://www.vicioussyndicate.com/data-reaper-live/',
  updatedAt: '2026-07-26T08:00:00.000Z',
  minimumDeckFrequency: 0.5,
  classDistribution: [
    { class: 'Mage', classLabel: 'Маг', classIcon: 'mage', frequency: 18.5 },
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 12.25 },
  ],
  deckDistribution: [
    { deck: 'Burn Mage', deckLabel: 'Берн Маг', class: 'Mage', classLabel: 'Маг', classIcon: 'mage', frequency: 8.4, build: null },
    { deck: 'Control Warrior', deckLabel: 'Контроль Воин', class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 5.1, build: null },
  ],
  tierList: [
    {
      rankBracket: 'All ranks',
      rankLabel: 'Все ранги',
      decks: [
        { rank: 1, deck: 'Burn Mage', deckLabel: 'Берн Маг', class: 'Mage', classLabel: 'Маг', classIcon: 'mage', winrate: 53.2, build: null },
      ],
    },
  ],
  buildCoverage: { found: 0, total: 2 },
};

const build = {
  deckCode: 'AAECAf0EBK/ABtH4BsvhBqfTBw2P9AaM9AaQ9AaY9Aaa9Aab9Aad9Aaf9Aag9Aah9Aai9Aaj9Aak9AYAAA==',
  source: 'hsguru-decks',
  sourceLabel: 'HSGuru',
  sourceUrl: 'https://www.hsguru.com/deck/example',
  matchedArchetype: 'Burn Mage',
  matchMethod: 'exact',
  updatedAt: '2026-07-26T08:00:00.000Z',
  winrate: 53.2,
  sampleGames: 1000,
  deckCards: [],
};

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith('/api/vicious-syndicate-gold/builds')) {
    await new Promise(resolve => window.setTimeout(resolve, 2_000));
    return new Response(JSON.stringify({
      builds: [
        { deck: 'Burn Mage', build },
        { deck: 'Control Warrior', build: null },
      ],
      buildCoverage: { found: 1, total: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.endsWith('/api/vicious-syndicate-gold')) {
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ViciousSyndicateGold />
  </React.StrictMode>,
);
