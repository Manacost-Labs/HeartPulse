import { createHash } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { StandardMetaClassKey } from './standardMetaClasses.js';

export type ConstructedArchetypeFormat = 'standard' | 'wild';

export type ConstructedArchetypeBuild = {
  deckCode: string;
  games: number | null;
  winrate: number | null;
  sourceUrl: string;
  updatedAt: string | null;
  classKey: StandardMetaClassKey | null;
  sampleRank: string;
  samplePeriod: string;
};

export type ConstructedArchetypeItem = {
  slug: string;
  archetype: string;
  archetypeLabel: string;
  translated: boolean;
  classKey: StandardMetaClassKey | null;
  format: ConstructedArchetypeFormat;
  games: number;
  winrate: number | null;
  popularity: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
  deckCount: number;
  builds: ConstructedArchetypeBuild[];
  sourceUrl: string;
};

export type ConstructedArchetypeHistoryPoint = {
  recordedAt: string;
  games: number;
  winrate: number | null;
  popularity: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
};

export type ConstructedArchetypeClassMatchup = {
  classKey: StandardMetaClassKey;
  classLabel: string;
  winrate: number;
  games: number;
  share: number | null;
};

export type ConstructedArchetypeCardStat = {
  cardId: string | null;
  dbfId: number | null;
  cardName: string;
  cost: number | null;
  mulliganImpact: number | null;
  mulliganCount: number;
  drawnImpact: number | null;
  drawnCount: number | null;
  keptImpact: number | null;
  keptCount: number | null;
};

export type ConstructedArchetypeAnalysis = {
  rank: 'legend';
  period: 'past_week';
  state: 'ok' | 'partial' | 'error';
  updatedAt: string | null;
  matchupsUpdatedAt: string | null;
  cardStatsUpdatedAt: string | null;
  sourceUrls: {
    matchups: string;
    cards: string;
  };
  classMatchups: ConstructedArchetypeClassMatchup[];
  cardStats: ConstructedArchetypeCardStat[];
};

export type ConstructedArchetypeCatalog = {
  format: ConstructedArchetypeFormat;
  formatLabel: string;
  patch: string;
  minimumGames: number;
  updatedAt: string | null;
  coverage: Record<string, unknown>;
  items: ConstructedArchetypeItem[];
};

export type ConstructedArchetypeRouterDependencies = {
  accessGuard: RequestHandler;
  setPrivateNoStore: (response: import('express').Response) => void;
  loadCatalog: (format: ConstructedArchetypeFormat) => Promise<ConstructedArchetypeCatalog>;
  loadHistory: (
    format: ConstructedArchetypeFormat,
    archetype: string,
  ) => Promise<ConstructedArchetypeHistoryPoint[]>;
  loadAnalysis: (
    format: ConstructedArchetypeFormat,
    archetype: string,
  ) => Promise<ConstructedArchetypeAnalysis | null>;
  onError?: (scope: 'catalog' | 'detail' | 'history' | 'analysis', error: unknown) => void;
};

const FORMATS = new Set<ConstructedArchetypeFormat>(['standard', 'wild']);

export function constructedArchetypeSlug(value: string): string {
  const base = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  if (base) return base;
  return `archetype-${createHash('sha1').update(value).digest('hex').slice(0, 10)}`;
}

function readFormat(value: unknown): ConstructedArchetypeFormat | null {
  const format = String(value ?? 'standard') as ConstructedArchetypeFormat;
  return FORMATS.has(format) ? format : null;
}

function readSearch(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function responseGuard(dependencies: ConstructedArchetypeRouterDependencies): RequestHandler {
  return (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  };
}

export function createConstructedArchetypeRouter(
  dependencies: ConstructedArchetypeRouterDependencies,
): Router {
  const router = Router();
  router.use('/constructed-archetypes', dependencies.accessGuard, responseGuard(dependencies));

  router.get('/constructed-archetypes', async (request, response) => {
    const format = readFormat(request.query.format);
    if (!format) return response.status(400).json({ error: 'Неизвестный формат' });
    try {
      const catalog = await dependencies.loadCatalog(format);
      const query = readSearch(request.query.q).toLocaleLowerCase('ru-RU');
      const items = query
        ? catalog.items.filter(item => (
          `${item.archetype} ${item.archetypeLabel}`.toLocaleLowerCase('ru-RU').includes(query)
        ))
        : catalog.items;
      return response.json({
        ...catalog,
        items: items.map(item => ({ ...item, builds: [] })),
      });
    } catch (error) {
      dependencies.onError?.('catalog', error);
      return response.status(502).json({ error: 'Каталог архетипов временно недоступен' });
    }
  });

  router.get('/constructed-archetypes/:format/:slug', async (request, response) => {
    const format = readFormat(request.params.format);
    const slug = String(request.params.slug ?? '').trim().toLowerCase();
    if (!format || !/^[a-z0-9-]{1,90}$/.test(slug)) {
      return response.status(400).json({ error: 'Некорректный адрес архетипа' });
    }
    try {
      const catalog = await dependencies.loadCatalog(format);
      const item = catalog.items.find(row => row.slug === slug);
      if (!item) return response.status(404).json({ error: 'Архетип не найден в текущей мете' });
      const [history, analysis] = await Promise.all([
        dependencies.loadHistory(format, item.archetype),
        dependencies.loadAnalysis(format, item.archetype).catch(error => {
          dependencies.onError?.('analysis', error);
          return null;
        }),
      ]);
      return response.json({
        format: catalog.format,
        formatLabel: catalog.formatLabel,
        patch: catalog.patch,
        minimumGames: catalog.minimumGames,
        updatedAt: catalog.updatedAt,
        item,
        history,
        analysis,
      });
    } catch (error) {
      dependencies.onError?.('detail', error);
      return response.status(502).json({ error: 'Страница архетипа временно недоступна' });
    }
  });

  return router;
}
