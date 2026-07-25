import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import StandardMetaPage from '../../src/features/StandardMeta';
import ConstructedArchetypes from '../../src/features/ConstructedArchetypes';
import '../../src/index.css';

const metaItems = [
  ['void-soul-dh', 'Void Soul DH', 'Охотник на демонов Бездны', 'demonhunter', 60.4, 36.7, 390_438],
  ['elemental-mage', 'Elemental Mage', 'Маг на элементалях', 'mage', 56.8, 14.2, 151_204],
  ['discover-hunter', 'Discover Hunter', 'Охотник на раскопках', 'hunter', 54.9, 10.8, 109_833],
].map(([slug, archetype, archetypeLabel, classKey, winrate, popularity, games], index) => ({
  id: `fixture-${index + 1}`,
  slug,
  archetype,
  archetypeLabel,
  translated: true,
  classKey,
  winrate,
  popularity,
  games,
  turns: 8.1 + index / 10,
  durationMinutes: 7.8 + index / 10,
  climbingSpeed: 0.7 - index / 10,
}));

const metaPayload = (format: 'standard' | 'wild') => ({
  format,
  formatLabel: format === 'standard' ? 'Стандарт' : 'Вольный',
  rank: 'diamond_legend',
  rankLabel: 'Алмаз — Легенда',
  period: 'patch_36.0.3',
  availablePeriods: ['patch_36.0.3', 'violet_hold', 'past_day', 'past_3_days', 'past_week', 'past_2_weeks'],
  currentPatchPeriod: 'patch_36.0.3',
  coin: 'any_player',
  minGames: 100,
  source: 'hsguru',
  sourceUrl: 'https://www.hsguru.com/meta',
  translationSource: 'database',
  updatedAt: '2026-07-25T12:00:00.000Z',
  items: metaItems,
});

const catalogItems = [
  ...metaItems,
  {
    ...metaItems[0],
    id: 'fixture-4',
    slug: 'control-priest',
    archetype: 'Control Priest',
    archetypeLabel: 'Контроль Жрец',
    classKey: 'priest',
    games: 81_120,
    winrate: 51.8,
    popularity: 8.1,
  },
].map(item => ({
  slug: item.slug,
  archetype: item.archetype,
  archetypeLabel: item.archetypeLabel,
  translated: true,
  classKey: item.classKey,
  format: 'standard',
  games: item.games,
  winrate: item.winrate,
  popularity: item.popularity,
  turns: item.turns,
  durationMinutes: item.durationMinutes,
  climbingSpeed: item.climbingSpeed,
  deckCount: 12,
  builds: [],
  sourceUrl: 'https://www.hsguru.com/meta',
}));

const catalog = {
  format: 'standard',
  formatLabel: 'Стандарт',
  patch: '36.0.3',
  minimumGames: 50,
  updatedAt: '2026-07-25T12:00:00.000Z',
  coverage: {},
  items: catalogItems,
};

const detail = {
  format: 'standard',
  formatLabel: 'Стандарт',
  patch: '36.0.3',
  minimumGames: 50,
  updatedAt: '2026-07-25T12:00:00.000Z',
  item: catalogItems[0],
  featuredBuild: {
    games: 17_452,
    winrate: 60.5,
    updatedAt: '2026-07-25T12:00:00.000Z',
    sampleRank: 'all',
    samplePeriod: 'past_30_days',
  },
  history: [],
  analysis: null,
};

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), window.location.origin);
  let payload: unknown;
  if (url.pathname === '/api/standard-meta/teaser') {
    payload = metaPayload(url.searchParams.get('format') === 'wild' ? 'wild' : 'standard');
  } else if (url.pathname.endsWith('/standard/void-soul-dh')) {
    payload = detail;
  } else {
    const format = url.searchParams.get('format') === 'wild' ? 'wild' : 'standard';
    payload = {
      ...catalog,
      format,
      formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт',
      items: catalog.items.map(item => ({ ...item, format })),
    };
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

const paywall = {
  authUser: null,
  subscriptionStatus: null,
  subscriptionLoading: false,
  onRefreshSubscription: async () => null,
};

function Harness() {
  const page = new URLSearchParams(window.location.search).get('page') ?? 'meta';
  const [path, setPath] = useState(page === 'archetype'
    ? '/standard/archetypes/standard/void-soul-dh'
    : '/standard/archetypes');

  return (
    <div className={`arena-app-shell arena-app-game-data ${page === 'meta' ? 'arena-app-standard-meta' : 'arena-app-constructed-archetypes'}`}>
      <div className="arena-workspace">
        <div className="arena-main">
          <div className="arena-content arena-content-open">
            {page === 'meta' ? (
              <StandardMetaPage hasFullAccess={false} paywall={paywall} />
            ) : (
              <ConstructedArchetypes
                currentPath={path}
                navigatePath={setPath}
                hasFullAccess={false}
                paywall={paywall}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
