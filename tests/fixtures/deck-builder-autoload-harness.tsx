import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DeckBuilder from '../../src/features/DeckBuilder';
import '../../src/index.css';

const resolvedCards = [
  { id: 'CORE_CS2_023', dbfId: 555, name: 'Чародейский интеллект', cost: 3, rarity: 'COMMON', elite: false, count: 2, image: '', cardImage: '' },
  { id: 'CORE_CS2_024', dbfId: 662, name: 'Ледяная стрела', cost: 2, rarity: 'FREE', elite: false, count: 2, image: '', cardImage: '' },
  { id: 'CORE_CS2_029', dbfId: 695, name: 'Огненный шар', cost: 4, rarity: 'FREE', elite: false, count: 2, image: '', cardImage: '' },
];

const catalogCards = [
  {
    card_id: 'CORE_CS2_023',
    dbf: 555,
    name: { ru: 'Чародейский интеллект', en: 'Arcane Intellect' },
    class: 'MAGE',
    multi_class: [],
    rarity: 'COMMON',
    card_type: { slug: 'SPELL', name_ru: 'Заклинание' },
    mana_cost: 3,
    mechanics: [],
    images: { card: '/assets/og-preview.png' },
  },
  {
    card_id: 'TEST_NEUTRAL',
    dbf: 1001,
    name: { ru: 'Нейтральный испытатель', en: 'Neutral Tester' },
    class: 'NEUTRAL',
    multi_class: [],
    rarity: 'RARE',
    card_type: { slug: 'MINION', name_ru: 'Существо' },
    mana_cost: 2,
    mechanics: ['BATTLECRY'],
    images: { card: '/assets/og-preview.png' },
  },
];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/api/admin/deck-builder/resolve')) {
    return new Response(JSON.stringify({
      ok: true,
      format: 'standard',
      heroDbfId: 637,
      deckCode: new URLSearchParams(window.location.search).get('code'),
      cards: resolvedCards,
      sideboards: [],
      totalCards: 6,
      deckSizeLimit: 30,
      archetype: { archetype: 'Elemental Mage', archetypeLabel: 'Маг на элементалях', score: 1 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('/api/constructed-cards')) {
    return new Response(JSON.stringify({
      cards: catalogCards,
      facets: {
        classes: ['MAGE', 'NEUTRAL'],
        rarities: ['COMMON', 'RARE'],
        types: ['MINION', 'SPELL'],
        minionTypes: [],
        spellSchools: [],
        mechanics: ['BATTLECRY'],
      },
      mechanicTranslations: { BATTLECRY: 'Боевой клич' },
      pagination: { total: catalogCards.length, totalPages: 1 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ method: init?.method || 'GET' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeckBuilder isAdmin authChecking={false} />
  </StrictMode>,
);
