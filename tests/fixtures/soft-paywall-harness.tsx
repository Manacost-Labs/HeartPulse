import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import StandardMetaPage from '../../src/features/StandardMeta';
import ConstructedArchetypes from '../../src/features/ConstructedArchetypes';
import FunDecksPage from '../../src/features/FunDecksPage';
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

const funDecks = {
  fetchedAt: '2026-07-26T10:15:12.000Z',
  stats: { total: 6, standard: 3, wild: 3 },
  methodology: { detectorVersion: 'concept-v6', minFunScore: 0.55, maxMetaSimilarity: 0.42 },
  decks: Array.from({ length: 6 }, (_, index) => ({
    title: `Фановая колода ${index + 1}`,
    deckCode: String.fromCharCode(65 + index).repeat(24),
    format: index < 3 ? 'Standard' : 'Wild',
    className: ['Mage', 'DeathKnight', 'Druid', 'Warlock', 'Rogue', 'Shaman'][index],
    streamer: index % 2 ? `streamer-${index}` : null,
    funScore: 0.95 - index * 0.04,
    maxMetaSimilarity: 0.18 + index * 0.02,
    nearestArchetype: `Мета ${index + 1}`,
    winRate: 48 + index,
    games: 20 + index * 10,
    reasons: [],
    url: null,
    firstSeenAt: `2026-07-26T0${index + 1}:00:00.000Z`,
    lastSeenAt: '2026-07-26T10:00:00.000Z',
  })),
};

const resolvedMainCards = ([
  ['TIME_001', 'Воскрешение мёртвых', 0, 'COMMON', 2, false],
  ['TIME_002', 'Камень здоровья', 0, 'EPIC', 2, false],
  ['TIME_003', 'Проклятые катакомбы', 0, 'EPIC', 2, false],
  ['TIME_004', 'Взрывной дух', 1, 'COMMON', 2, false],
  ['TIME_005', 'Демоново семя', 1, 'LEGENDARY', 1, true],
  ['TIME_006', 'Кара огненная', 1, 'RARE', 2, false],
  ['TIME_007', 'Кобольд-библиотекарь', 1, 'COMMON', 2, false],
  ['TIME_008', 'Кристаллизатор', 1, 'EPIC', 2, false],
  ['TIME_009', 'Лоцман сэр Финли', 1, 'LEGENDARY', 1, true],
  ['TIME_010', 'Массовое производство', 1, 'COMMON', 2, false],
  ['TIME_011', 'Ожившая метла', 1, 'COMMON', 2, false],
  ['TIME_012', 'Гнилое яблоко', 2, 'COMMON', 2, false],
  ['TIME_013', 'Душеворот', 2, 'LEGENDARY', 1, true],
  ['TIME_014', 'Неофитка культа', 2, 'RARE', 2, false],
  ['TIME_015', 'Эффект домино', 3, 'RARE', 1, false],
  ['TIME_016', 'Пленённый ужас', 9, 'EPIC', 2, false],
  ['TIME_017', 'Огненный великан', 20, 'EPIC', 2, false],
] as const).map(([id, name, cost, rarity, count, elite], index) => ({
  id,
  dbfId: 1001 + index,
  name,
  cost,
  rarity,
  elite,
  count,
  image: `/wallpaper/${index % 2 ? 'profile-hero-hth.webp' : 'home-paladin-hero.webp'}`,
  cardImage: '',
}));

const resolvedSideboardCards = ([
  ['TIME_SB_001', 'Запасная искра', 1, 'RARE'],
  ['TIME_SB_002', 'Тайный проход', 2, 'EPIC'],
  ['TIME_SB_003', 'Последний ритуал', 4, 'COMMON'],
] as const).map(([id, name, cost, rarity], index) => ({
  id,
  dbfId: 2001 + index,
  name,
  cost,
  rarity,
  elite: false,
  count: 1,
  image: '/wallpaper/profile-hero-hth.webp',
  cardImage: '',
}));

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), window.location.origin);
  let payload: unknown;
  if (url.pathname === '/api/deck/render' && new URLSearchParams(window.location.search).get('render') === 'ready') {
    payload = {
      ok: true,
      ready: true,
      renderer: 'rust',
      style: 'parchment',
      imageUrl: '/wallpaper/home-paladin-hero.webp',
    };
  } else if (url.pathname === '/api/fun-decks') {
    payload = funDecks;
  } else if (url.pathname === '/api/deck/resolve') {
    payload = {
      ok: true,
      format: url.searchParams.get('format') === 'wild' ? 'wild' : 'standard',
      heroDbfId: 637,
      deckCode: url.searchParams.get('code'),
      cards: resolvedMainCards,
      sideboards: [{
        keyCardDbfId: 1005,
        label: 'Сайдборд · Демоново семя',
        keyCard: resolvedMainCards[4],
        cards: resolvedSideboardCards,
      }],
      totalCards: 30,
      deckSizeLimit: 30,
      archetype: null,
    };
  } else if (url.pathname === '/api/standard-meta/teaser') {
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
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page') ?? 'meta';
  const hasFullAccess = params.get('access') === 'full';
  const [path, setPath] = useState(page === 'archetype'
    ? '/standard/archetypes/standard/void-soul-dh'
    : '/standard/archetypes');

  return (
    <div className={`arena-app-shell arena-app-game-data ${
      page === 'meta'
        ? 'arena-app-standard-meta'
        : page === 'fun-decks'
          ? 'arena-app-fun-decks'
          : 'arena-app-constructed-archetypes'
    }`}>
      <div className="arena-workspace">
        <div className="arena-main">
          <div className="arena-content arena-content-open">
            {page === 'meta' ? (
              <StandardMetaPage hasFullAccess={hasFullAccess} paywall={paywall} />
            ) : page === 'fun-decks' ? (
              <FunDecksPage hasFullAccess={hasFullAccess} paywall={paywall} />
            ) : (
              <ConstructedArchetypes
                currentPath={path}
                navigatePath={setPath}
                hasFullAccess={hasFullAccess}
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
