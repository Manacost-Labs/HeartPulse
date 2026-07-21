import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DeckModal } from '../../src/features/StandardMeta';
import type { HsReplayDeckCard } from '../../src/features/HsReplayDeckList';

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const fullCard = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="716">
    <rect width="512" height="716" rx="42" fill="#4b1425"/>
    <rect x="22" y="22" width="468" height="672" rx="34" fill="none" stroke="#e9c776" stroke-width="18"/>
    <text x="256" y="356" fill="#fff3c4" font-family="serif" font-size="36" text-anchor="middle">Тестовая карта</text>
  </svg>
`)}`;
const deckCards: HsReplayDeckCard[] = Array.from({ length: 30 }, (_, index) => ({
  id: `NESTED_TEST_${String(index + 1).padStart(2, '0')}`,
  dbfId: 91_000 + index,
  name: `Тестовая карта ${index + 1}`,
  cost: index % 10,
  rarity: index % 9 === 0 ? 'LEGENDARY' : 'COMMON',
  elite: index % 9 === 0,
  count: 1,
  image: pixel,
  cardImage: fullCard,
}));

const modalState = {
  item: {
    id: 'nested-meta', archetype: 'Nested Shaman', archetypeLabel: 'Вложенный Шаман', translated: true,
    classKey: 'shaman', winrate: 52, popularity: 5, games: 100, turns: 8, durationMinutes: 7, climbingSpeed: 0.2,
  },
  recommendation: {
    archetype: 'Nested Shaman', archetypeLabel: 'Вложенный Шаман', deckCode: 'AAECAaoITestNestedModal',
    format: 'standard', rank: 'legend', source: 'test', sourceUrl: '', streamer: 'Тестер', sampleGames: 100,
    winrate: 52, updatedAt: null, classKey: 'shaman', matchedArchetype: 'Nested Shaman', matchMethod: 'exact', deckCards,
  },
  preview: null,
  loadingRecommendation: false,
  loadingPreview: false,
  error: '',
  previewError: '',
};

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <button id="open-standard-meta" type="button" onClick={() => setOpen(true)}>Открыть сборку</button>
      {open && (
        <DeckModal
          state={modalState as never}
          onClose={() => setOpen(false)}
          onRenderPreview={() => undefined}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
