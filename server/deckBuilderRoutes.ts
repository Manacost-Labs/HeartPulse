import { Router, type RequestHandler, type Response } from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';
import {
  indexCardsByDbf,
  indexCardsRuByDbf,
  normalizeArchetypeKey,
  resolveDeckCard,
  resolveDeckFromCode,
  type DeckBuilderCardRecord,
  type DeckBuilderFormat,
  type DeckBuilderResolvedCard,
  type DeckBuilderResolveResult,
} from './deckBuilderResolve.js';

type DeckBuilderRouterDependencies = {
  adminGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  getDatabase: () => DatabaseSync;
  loadCatalogCards: (format: DeckBuilderFormat) => Promise<DeckBuilderCardRecord[]>;
  loadCardsRu: () => Record<string, any> | null;
  loadArchetypeTranslations: () => Promise<Record<string, string>> | Record<string, string>;
};

const HSJSON_ALL_CARDS_URL = 'https://api.hearthstonejson.com/v1/latest/ruRU/cards.json';
let hsjsonAllCardsCache: {
  expiresAt: number;
  byDbf: Map<number, DeckBuilderCardRecord>;
  byId: Record<string, any>;
} | null = null;
let hsjsonAllCardsPromise: Promise<NonNullable<typeof hsjsonAllCardsCache>> | null = null;

async function loadHsjsonAllCards(): Promise<NonNullable<typeof hsjsonAllCardsCache>> {
  const now = Date.now();
  if (hsjsonAllCardsCache && hsjsonAllCardsCache.expiresAt > now) return hsjsonAllCardsCache;
  if (!hsjsonAllCardsPromise) {
    hsjsonAllCardsPromise = (async () => {
      const response = await fetch(HSJSON_ALL_CARDS_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`HSJSON cards HTTP ${response.status}`);
      const rows = await response.json() as Array<Record<string, any>>;
      const byDbf = new Map<number, DeckBuilderCardRecord>();
      const byId: Record<string, any> = {};
      for (const row of rows) {
        const id = String(row?.id ?? '').trim();
        const dbfId = Number(row?.dbfId ?? row?.dbf);
        if (!id || !Number.isSafeInteger(dbfId) || dbfId <= 0) continue;
        byId[id] = {
          name: String(row?.name ?? id),
          mana: Number.isFinite(Number(row?.cost)) ? Number(row.cost) : null,
          rarity: String(row?.rarity ?? 'COMMON').toLowerCase(),
          dbf: dbfId,
          type: String(row?.type ?? '').toLowerCase(),
        };
        if (!byDbf.has(dbfId)) {
          byDbf.set(dbfId, {
            card_id: id,
            dbf: dbfId,
            name: String(row?.name ?? id),
            mana_cost: Number.isFinite(Number(row?.cost)) ? Number(row.cost) : 0,
            rarity: String(row?.rarity ?? 'COMMON').toUpperCase(),
          });
        }
      }
      const value = { expiresAt: Date.now() + 6 * 60 * 60 * 1000, byDbf, byId };
      hsjsonAllCardsCache = value;
      return value;
    })().finally(() => {
      hsjsonAllCardsPromise = null;
    });
  }
  return hsjsonAllCardsPromise;
}

function mergeCardIndexes(
  preferred: Map<number, DeckBuilderCardRecord>,
  fallback: Map<number, DeckBuilderCardRecord>,
): Map<number, DeckBuilderCardRecord> {
  const merged = new Map(fallback);
  for (const [dbfId, card] of preferred) merged.set(dbfId, card);
  return merged;
}

function readFormat(value: unknown): DeckBuilderFormat {
  return String(value ?? '').toLowerCase() === 'wild' ? 'wild' : 'standard';
}

function readDeckCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  const fromUrl = raw.match(/[?&]code=([^&]+)/i);
  return decodeURIComponent((fromUrl?.[1] || raw).replace(/ /g, '+')).trim();
}

function loadArchetypeCandidates(database: DatabaseSync): Array<{ nameEn: string; deckCode: string }> {
  try {
    const rows = database.prepare(`
      SELECT name_en AS nameEn, deck_code AS deckCode
      FROM archetype_deck_codes
      WHERE deck_code IS NOT NULL AND length(trim(deck_code)) >= 20
      ORDER BY updated_at DESC
      LIMIT 500
    `).all() as Array<{ nameEn?: string; deckCode?: string }>;
    return rows.flatMap(row => {
      const nameEn = String(row.nameEn ?? '').trim();
      const deckCode = String(row.deckCode ?? '').trim();
      return nameEn && deckCode ? [{ nameEn, deckCode }] : [];
    });
  } catch {
    return [];
  }
}

async function fetchHsGuruArchetype(deckCode: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.hsguru.com/api/deck-info/${encodeURIComponent(deckCode)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)',
      },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { archetype?: string; name?: string };
    const name = String(payload?.archetype || payload?.name || '').trim();
    return name || null;
  } catch {
    return null;
  }
}

async function resolveDeckPayload(
  dependencies: DeckBuilderRouterDependencies,
  deckCode: string,
  preferredFormat: DeckBuilderFormat,
): Promise<DeckBuilderResolveResult> {
  const [standardCards, wildCards, translations, hsjson, hsGuruArchetype] = await Promise.all([
    dependencies.loadCatalogCards('standard'),
    dependencies.loadCatalogCards('wild'),
    Promise.resolve(dependencies.loadArchetypeTranslations()),
    loadHsjsonAllCards().catch(() => null),
    fetchHsGuruArchetype(deckCode),
  ]);
  const cardsRuLocal = dependencies.loadCardsRu() || {};
  const cardsRu = { ...cardsRuLocal, ...(hsjson?.byId || {}) };
  const candidates = loadArchetypeCandidates(dependencies.getDatabase());
  const translationMap = Object.fromEntries(
    Object.entries(translations).map(([key, value]) => [normalizeArchetypeKey(key), value]),
  );
  const catalogCards = preferredFormat === 'wild'
    ? [...wildCards, ...standardCards, ...(hsjson ? [...hsjson.byDbf.values()] : [])]
    : [...standardCards, ...wildCards, ...(hsjson ? [...hsjson.byDbf.values()] : [])];

  const resolved = resolveDeckFromCode({
    deckCode,
    catalogCards,
    cardsRu,
    archetypeCandidates: candidates,
    archetypeTranslations: translationMap,
    preferredArchetypeName: hsGuruArchetype,
  });
  if (!resolved) throw Object.assign(new Error('Некорректный код колоды'), { status: 400 });
  if (!resolved.archetype) {
    const localOnly = resolveDeckFromCode({
      deckCode: resolved.deckCode,
      catalogCards,
      cardsRu,
      archetypeCandidates: candidates,
      archetypeTranslations: translationMap,
    });
    if (localOnly?.archetype) resolved.archetype = localOnly.archetype;
  }
  return resolved;
}

export function createDeckBuilderRouter(dependencies: DeckBuilderRouterDependencies): Router {
  const router = Router();

  const handleResolve = async (request: any, response: Response, privateResponse: boolean) => {
    if (privateResponse) dependencies.setPrivateNoStore(response);
    else {
      response.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    }
    const deckCode = readDeckCode(
      request.body?.deckCode
      ?? request.body?.code
      ?? request.query?.deckCode
      ?? request.query?.code,
    );
    if (!deckCode) return response.status(400).json({ error: 'Нужен код колоды' });
    const preferredFormat = readFormat(request.body?.format ?? request.query?.format);
    try {
      const resolved = await resolveDeckPayload(dependencies, deckCode, preferredFormat);
      return response.json({ ok: true, ...resolved });
    } catch (error: any) {
      const status = Number(error?.status) || 503;
      return response.status(status).json({
        error: status === 400 ? 'Некорректный код колоды' : 'Не удалось разобрать колоду',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Public embed endpoint — instant card list for any page on the site.
  router.get('/deck/resolve', (request, response) => void handleResolve(request, response, false));
  router.post('/deck/resolve', (request, response) => void handleResolve(request, response, false));

  router.post('/admin/deck-builder/resolve', dependencies.adminGuard, (request, response) => {
    void handleResolve(request, response, true);
  });

  router.post('/admin/deck-builder/hydrate', dependencies.adminGuard, async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const format = readFormat(request.body?.format);
    const rawCards = Array.isArray(request.body?.cards) ? request.body.cards : [];
    const wanted = rawCards.flatMap((row: any) => {
      const dbfId = Number(row?.dbfId ?? row?.dbf);
      const count = Number(row?.count ?? 1);
      return Number.isSafeInteger(dbfId) && dbfId > 0 && Number.isSafeInteger(count) && count > 0
        ? [{ dbfId, count }]
        : [];
    });
    if (!wanted.length) return response.status(400).json({ error: 'Нужен список карт' });
    try {
      const [catalogCards, hsjson] = await Promise.all([
        dependencies.loadCatalogCards(format),
        loadHsjsonAllCards().catch(() => null),
      ]);
      const cardsRuLocal = dependencies.loadCardsRu() || {};
      const cardsRu = { ...cardsRuLocal, ...(hsjson?.byId || {}) };
      const catalogByDbf = mergeCardIndexes(
        indexCardsByDbf(catalogCards),
        hsjson?.byDbf || new Map(),
      );
      const cardsRuByDbf = indexCardsRuByDbf(cardsRu);
      const cards: DeckBuilderResolvedCard[] = wanted.flatMap(({ dbfId, count }) => {
        const resolved = resolveDeckCard(dbfId, count, catalogByDbf, cardsRuByDbf, cardsRu);
        return resolved ? [resolved] : [];
      });
      return response.json({ ok: true, format, cards });
    } catch (error) {
      return response.status(503).json({
        error: 'Не удалось обогатить карты',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
