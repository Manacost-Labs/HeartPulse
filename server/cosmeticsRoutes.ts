import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { Router, type Request, type Response as ExpressResponse } from 'express';

type JsonRecord = Record<string, any>;
export type CosmeticKind = 'heroes' | 'coins' | 'pets';

export type CosmeticsCatalogQuery = {
  page: number;
  perPage: number;
  q: string;
  classSlug?: string;
  rarity?: string;
  category?: string;
};

export type CosmeticsDataService = {
  loadCatalog: (kind: CosmeticKind, query: CosmeticsCatalogQuery) => Promise<JsonRecord>;
  loadDetail: (kind: CosmeticKind, cardId: string) => Promise<JsonRecord | null>;
};

const DB_ORIGIN = 'https://db.kolodahs.ru';
const ALLOWED_MEDIA_HOSTS = new Set([
  'db.kolodahs.ru',
  'hearthstone.wiki.gg',
  'art.hearthstonejson.com',
]);
const HERO_RARITIES = new Set(['basic', 'lite', 'full', 'diamond', 'legendary', 'mythic']);
const HERO_RARITY_NAMES_RU: Record<string, string> = {
  basic: 'Базовый',
  lite: 'Обычный',
  full: 'Полный',
  diamond: 'Алмазный',
  legendary: 'Легендарный',
  mythic: 'Мифический',
};
const HERO_CLASSES = new Set([
  'deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin',
  'priest', 'rogue', 'shaman', 'warlock', 'warrior',
]);
const HERO_CATEGORIES = new Set([
  'battle_pass',
  'events_promos',
  'money',
  '2500_runestone_skins',
  'paid_track_skins',
  'free_track_skins',
  'rewards_track_portraits',
  'event_track_skins',
  'unavailable',
  'bundle_skins',
  'expansion_preorder_heroes',
  'tavern_regular_portraits',
  '1800_gold_skins',
  '1200_gold_skins',
  'expansion_preorder_heroes',
  'promotional_special_events_heroes',
]);
const HERO_CATEGORY_GROUPS: Record<string, string[]> = {
  battle_pass: ['paid_track_skins', 'free_track_skins', 'rewards_track_portraits'],
  events_promos: ['event_track_skins', 'promotional_special_events_heroes'],
  money: ['bundle_skins'],
};
const HERO_TAG_CATEGORY_SLUGS: Record<string, string> = {
  '2500 runestone skins': '2500_runestone_skins',
  'rewards track portraits': 'rewards_track_portraits',
  'promotional and special events heroes': 'promotional_special_events_heroes',
  'expansion pre-order heroes': 'expansion_preorder_heroes',
  'bundle purchasable heroes': 'bundle_skins',
  'unavailable skins': 'unavailable',
  'tavern regular portraits': 'tavern_regular_portraits',
  '1800 gold skins': '1800_gold_skins',
  '1200 gold skins': '1200_gold_skins',
};

const finiteInteger = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

const cleanText = (value: unknown, maximum = 200): string => String(value ?? '').trim().slice(0, maximum);

export function normalizeCosmeticMediaUrl(value: unknown): string | null {
  const raw = cleanText(value, 2_000);
  if (!raw) return null;
  try {
    const url = raw.startsWith('/') ? new URL(raw, DB_ORIGIN) : new URL(raw);
    if (url.protocol !== 'https:' || !ALLOWED_MEDIA_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const normalizeName = (raw: JsonRecord, localizedNames: ReadonlyMap<string, string>) => {
  const cardId = cleanText(raw?.card_id, 100);
  const translated = cleanText(localizedNames.get(cardId), 200);
  const sourceRu = cleanText(raw?.name?.ru ?? raw?.name_ru, 200);
  const sourceEn = cleanText(raw?.name?.en ?? raw?.name_en, 200);
  return {
    ru: translated || sourceRu || sourceEn || cardId,
    en: sourceEn || null,
  };
};

export function normalizeHeroSkinSummary(
  raw: JsonRecord,
  localizedNames: ReadonlyMap<string, string> = new Map(),
) {
  const cardId = cleanText(raw?.card_id, 100);
  const raritySlug = cleanText(raw?.rarity?.slug, 40) || 'unknown';
  const staticUrl = normalizeCosmeticMediaUrl(raw?.images?.static);
  const animatedUrl = normalizeCosmeticMediaUrl(raw?.images?.animated);
  const categorySlugs = new Set<string>(
    Array.isArray(raw?.categories)
      ? raw.categories.map((category: JsonRecord) => cleanText(category?.slug, 80)).filter(Boolean)
      : [],
  );
  if (Array.isArray(raw?.tags)) {
    for (const tag of raw.tags) {
      const slug = HERO_TAG_CATEGORY_SLUGS[cleanText(tag, 160).toLocaleLowerCase('en-US')];
      if (slug) categorySlugs.add(slug);
    }
  }
  return {
    cardId,
    dbf: finiteInteger(raw?.dbf),
    name: normalizeName(raw, localizedNames),
    class: {
      slug: cleanText(raw?.class?.slug, 40) || 'neutral',
      nameRu: cleanText(raw?.class?.name_ru, 80) || 'Без класса',
    },
    rarity: {
      slug: raritySlug,
      nameRu: HERO_RARITY_NAMES_RU[raritySlug]
        || cleanText(raw?.rarity?.name_ru, 80)
        || 'Не указана',
    },
    categorySlugs: [...categorySlugs],
    images: {
      static: staticUrl,
      animated: animatedUrl,
    },
    updatedAt: cleanText(raw?.updated_at, 40) || null,
  };
}

const normalizeRelatedCard = (raw: JsonRecord) => ({
  cardId: cleanText(raw?.card_id, 100),
  dbf: finiteInteger(raw?.dbf),
  name: {
    ru: cleanText(raw?.name_ru, 200) || cleanText(raw?.name_en, 200) || cleanText(raw?.card_id, 100),
    en: cleanText(raw?.name_en, 200) || null,
  },
});

function normalizeCoinSummary(raw: JsonRecord) {
  return {
    cardId: cleanText(raw?.card_id, 100),
    dbf: finiteInteger(raw?.dbf),
    name: {
      ru: cleanText(raw?.name?.card_ru, 200) || 'Монетка',
      en: cleanText(raw?.name?.coin_en ?? raw?.name?.card_en, 200) || null,
    },
    textRu: cleanText(raw?.text?.ru, 500) || null,
    images: {
      card: normalizeCosmeticMediaUrl(raw?.images?.card),
      crop: normalizeCosmeticMediaUrl(raw?.images?.crop),
    },
    updatedAt: cleanText(raw?.updated_at, 40) || null,
  };
}

export function buildCoinCatalog(rawCoins: JsonRecord[], relations?: JsonRecord) {
  const first = rawCoins[0] ?? {};
  const source = relations && typeof relations === 'object' ? relations : first;
  return {
    items: rawCoins.map(normalizeCoinSummary),
    generatedBy: Array.isArray(source?.generated_by_cards)
      ? source.generated_by_cards.map(normalizeRelatedCard).filter((card: JsonRecord) => card.cardId)
      : [],
    related: Array.isArray(source?.related_cards)
      ? source.related_cards.map(normalizeRelatedCard).filter((card: JsonRecord) => card.cardId)
      : [],
  };
}

function normalizePetSummary(raw: JsonRecord) {
  return {
    cardId: cleanText(raw?.card_id, 100),
    dbf: finiteInteger(raw?.dbf),
    variantId: finiteInteger(raw?.variant?.id),
    name: cleanText(raw?.variant?.name, 200) || cleanText(raw?.card_id, 100),
    level: finiteInteger(raw?.variant?.level),
    images: {
      card: normalizeCosmeticMediaUrl(raw?.images?.card),
    },
    updatedAt: cleanText(raw?.updated_at, 40) || null,
  };
}

export function buildPetFamilies(rawPets: JsonRecord[]) {
  const families = new Map<number, { petId: number; name: string; variants: ReturnType<typeof normalizePetSummary>[] }>();
  for (const raw of rawPets) {
    const petId = finiteInteger(raw?.pet?.id);
    if (petId === null) continue;
    const family = families.get(petId) ?? {
      petId,
      name: cleanText(raw?.pet?.name, 200) || `Питомец ${petId}`,
      variants: [],
    };
    family.variants.push(normalizePetSummary(raw));
    families.set(petId, family);
  }
  return [...families.values()]
    .map(family => ({
      ...family,
      variants: family.variants.sort((left, right) => (left.level ?? 99) - (right.level ?? 99)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}

function normalizedGallery(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: JsonRecord) => {
    const url = normalizeCosmeticMediaUrl(entry?.file_url);
    return url ? [{
      url,
      caption: cleanText(entry?.caption ?? entry?.file_title, 300) || null,
    }] : [];
  });
}

function normalizedSounds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: JsonRecord) => {
    const url = normalizeCosmeticMediaUrl(entry?.file_url);
    return url ? [{
      url,
      type: cleanText(entry?.type, 160) || 'Реплика',
      transcript: cleanText(entry?.transcript, 1_000) || null,
    }] : [];
  });
}

function normalizeHeroDetail(raw: JsonRecord, localizedNames: ReadonlyMap<string, string>) {
  return {
    ...normalizeHeroSkinSummary(raw, localizedNames),
    health: finiteInteger(raw?.health),
    character: cleanText(raw?.character, 200) || null,
    actor: cleanText(raw?.actor, 200) || null,
    artist: cleanText(raw?.artist, 300) || null,
    categories: Array.isArray(raw?.categories)
      ? raw.categories.map((category: JsonRecord) => ({
        slug: cleanText(category?.slug, 80),
        nameRu: cleanText(category?.name_ru, 160) || cleanText(category?.name_en, 160),
      })).filter((category: JsonRecord) => category.slug)
      : [],
    images: {
      static: normalizeCosmeticMediaUrl(raw?.images?.static),
      animated: normalizeCosmeticMediaUrl(raw?.images?.animated),
      fullArt: normalizeCosmeticMediaUrl(raw?.images?.full_art),
    },
    gallery: normalizedGallery(raw?.gallery),
    sounds: normalizedSounds(raw?.sounds),
    sourceUrl: normalizeCosmeticMediaUrl(raw?.wiki_page?.url),
  };
}

function normalizeCoinDetail(raw: JsonRecord) {
  const catalog = buildCoinCatalog([raw]);
  return {
    ...catalog.items[0],
    text: {
      ru: cleanText(raw?.text?.ru, 2_000) || null,
      en: cleanText(raw?.text?.en, 2_000) || null,
    },
    images: {
      card: normalizeCosmeticMediaUrl(raw?.images?.card),
      golden: normalizeCosmeticMediaUrl(raw?.images?.golden),
      crop: normalizeCosmeticMediaUrl(raw?.images?.crop),
      wiki: normalizeCosmeticMediaUrl(raw?.images?.wiki),
    },
    generatedBy: catalog.generatedBy,
    related: catalog.related,
  };
}

function normalizePetDetail(raw: JsonRecord, family: JsonRecord[]) {
  const summary = normalizePetSummary(raw);
  return {
    ...summary,
    pet: {
      id: finiteInteger(raw?.pet?.id),
      name: cleanText(raw?.pet?.name, 200) || null,
    },
    images: {
      card: normalizeCosmeticMediaUrl(raw?.images?.card),
      endScreen: normalizeCosmeticMediaUrl(raw?.images?.end_screen_background),
    },
    gallery: normalizedGallery(raw?.gallery),
    variants: family.map(normalizePetSummary).sort((left, right) => (left.level ?? 99) - (right.level ?? 99)),
  };
}

type CosmeticsDataServiceDependencies = {
  fetchJson: (url: string) => Promise<any>;
  apiBaseUrl: string;
  localizedCardsUrl: string;
  cacheTtlMs?: number;
  now?: () => number;
};

type CacheEntry = { value: JsonRecord; expiresAt: number };

export function createCosmeticsDataService(dependencies: CosmeticsDataServiceDependencies): CosmeticsDataService {
  const now = dependencies.now ?? Date.now;
  const cacheTtlMs = Math.max(60_000, dependencies.cacheTtlMs ?? 30 * 60_000);
  const cache = new Map<string, CacheEntry>();
  const jobs = new Map<string, Promise<JsonRecord>>();
  let localizedNamesCache: { value: Map<string, string>; expiresAt: number } | null = null;
  let localizedNamesJob: Promise<Map<string, string>> | null = null;

  const getLocalizedNames = async () => {
    if (localizedNamesCache && localizedNamesCache.expiresAt > now()) return localizedNamesCache.value;
    if (localizedNamesJob) return localizedNamesJob;
    localizedNamesJob = dependencies.fetchJson(dependencies.localizedCardsUrl)
      .then(payload => {
        const names = new Map<string, string>();
        if (Array.isArray(payload)) {
          for (const card of payload) {
            const id = cleanText(card?.id, 100);
            const name = cleanText(card?.name, 200);
            if (id && name) names.set(id, name);
          }
        }
        localizedNamesCache = { value: names, expiresAt: now() + 12 * 60 * 60_000 };
        return names;
      })
      .catch(() => localizedNamesCache?.value ?? new Map<string, string>())
      .finally(() => { localizedNamesJob = null; });
    return localizedNamesJob;
  };

  const cachedFetch = async (key: string, url: URL): Promise<JsonRecord> => {
    const current = cache.get(key);
    if (current && current.expiresAt > now()) return current.value;
    const active = jobs.get(key);
    if (active) return active;
    const job = dependencies.fetchJson(url.toString())
      .then(payload => {
        cache.set(key, { value: payload, expiresAt: now() + cacheTtlMs });
        return payload;
      })
      .catch(error => {
        if (current) return current.value;
        throw error;
      })
      .finally(() => jobs.delete(key));
    jobs.set(key, job);
    return job;
  };

  const upstreamKind = (kind: CosmeticKind) => kind === 'heroes' ? 'hero-skins' : kind;
  const listUrl = (kind: CosmeticKind, query: CosmeticsCatalogQuery) => {
    const url = new URL(`${dependencies.apiBaseUrl.replace(/\/$/, '')}/${upstreamKind(kind)}`);
    url.searchParams.set('view', 'summary');
    url.searchParams.set('page', String(query.page));
    url.searchParams.set('per_page', String(kind === 'pets' || kind === 'coins' ? 100 : query.perPage));
    if (query.q) url.searchParams.set('q', query.q);
    if (kind === 'heroes' && query.classSlug) url.searchParams.set('class', query.classSlug);
    if (kind === 'heroes' && query.rarity) url.searchParams.set('rarity', query.rarity);
    if (kind === 'heroes' && query.category) url.searchParams.set('category', query.category);
    return url;
  };

  const loadAllHeroRows = async () => {
    const firstUrl = listUrl('heroes', { page: 1, perPage: 100, q: '' });
    const firstPayload = await cachedFetch(`list:${firstUrl.href}`, firstUrl);
    const totalPages = Math.max(1, finiteInteger(firstPayload?.pagination?.total_pages) ?? 1);
    const remaining = totalPages > 1
      ? await Promise.all(Array.from({ length: totalPages - 1 }, async (_, index) => {
        const pageUrl = listUrl('heroes', { page: index + 2, perPage: 100, q: '' });
        return cachedFetch(`list:${pageUrl.href}`, pageUrl);
      }))
      : [];
    return [firstPayload, ...remaining].flatMap(payload => Array.isArray(payload?.data) ? payload.data : []);
  };

  return {
    async loadCatalog(kind, query) {
      if (kind === 'heroes') {
        const [rows, names] = await Promise.all([loadAllHeroRows(), getLocalizedNames()]);
        const normalized = rows.map((row: JsonRecord) => normalizeHeroSkinSummary(row, names));
        const foldedQuery = query.q.toLocaleLowerCase('ru-RU');
        const filtered = normalized.filter(item => {
          if (query.classSlug && item.class.slug !== query.classSlug) return false;
          if (query.rarity && item.rarity.slug !== query.rarity) return false;
          if (query.category) {
            const accepted = HERO_CATEGORY_GROUPS[query.category] ?? [query.category];
            if (!accepted.some(category => item.categorySlugs.includes(category))) return false;
          }
          if (!foldedQuery) return true;
          return [
            item.name.ru,
            item.name.en,
            item.cardId,
            item.dbf === null ? '' : String(item.dbf),
          ].some(value => String(value ?? '').toLocaleLowerCase('ru-RU').includes(foldedQuery));
        });
        const totalPages = Math.max(1, Math.ceil(filtered.length / query.perPage));
        const page = Math.min(query.page, totalPages);
        const start = (page - 1) * query.perPage;
        return {
          items: filtered.slice(start, start + query.perPage),
          pagination: {
            page,
            perPage: query.perPage,
            total: filtered.length,
            totalPages,
          },
          updatedAt: rows.map((row: JsonRecord) => cleanText(row?.updated_at, 40)).filter(Boolean).sort().at(-1) ?? null,
          source: 'db.kolodahs.ru + HearthstoneJSON ruRU',
        };
      }
      const url = listUrl(kind, query);
      const payload = await cachedFetch(`list:${url.href}`, url);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const pagination = payload?.pagination ?? {};
      const base = {
        pagination: {
          page: finiteInteger(pagination?.page) ?? query.page,
          perPage: finiteInteger(pagination?.per_page) ?? query.perPage,
          total: finiteInteger(pagination?.total) ?? rows.length,
          totalPages: finiteInteger(pagination?.total_pages) ?? 1,
        },
        updatedAt: rows.map((row: JsonRecord) => cleanText(row?.updated_at, 40)).filter(Boolean).sort().at(-1) ?? null,
        source: 'db.kolodahs.ru',
      };
      if (kind === 'coins') return { ...buildCoinCatalog(rows, payload?.relations), ...base };
      return { items: buildPetFamilies(rows), ...base };
    },

    async loadDetail(kind, cardId) {
      const url = new URL(`${dependencies.apiBaseUrl.replace(/\/$/, '')}/${upstreamKind(kind)}/${encodeURIComponent(cardId)}`);
      let payload: JsonRecord;
      try {
        payload = await cachedFetch(`detail:${kind}:${cardId}`, url);
      } catch (error) {
        if (Number((error as { status?: unknown })?.status) === 404) return null;
        throw error;
      }
      const row = payload?.data;
      if (!row || typeof row !== 'object') return null;
      if (kind === 'heroes') return normalizeHeroDetail(row, await getLocalizedNames());
      if (kind === 'coins') return normalizeCoinDetail(row);
      const petId = finiteInteger(row?.pet?.id);
      if (petId === null) return normalizePetDetail(row, []);
      const familyUrl = listUrl('pets', { page: 1, perPage: 100, q: '' });
      familyUrl.searchParams.set('pet_id', String(petId));
      const familyPayload = await cachedFetch(`pet-family:${petId}`, familyUrl);
      return normalizePetDetail(row, Array.isArray(familyPayload?.data) ? familyPayload.data : []);
    },
  };
}

const readInteger = (value: unknown, fallback: number, minimum: number, maximum: number): number | null => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

const readCatalogQuery = (request: Request, kind: CosmeticKind): CosmeticsCatalogQuery | null => {
  const page = readInteger(request.query.page, 1, 1, 1_000);
  const perPage = readInteger(request.query.per_page, kind === 'heroes' ? 48 : 100, 1, 100);
  if (page === null || perPage === null) return null;
  const q = cleanText(request.query.search ?? request.query.q, 120);
  const classSlug = cleanText(request.query.class, 40);
  const rarity = cleanText(request.query.rarity, 40);
  const category = cleanText(request.query.category, 80);
  if (kind === 'heroes') {
    if (classSlug && !HERO_CLASSES.has(classSlug)) return null;
    if (rarity && !HERO_RARITIES.has(rarity)) return null;
    if (category && !HERO_CATEGORIES.has(category)) return null;
  }
  return {
    page,
    perPage,
    q,
    ...(classSlug ? { classSlug } : {}),
    ...(rarity ? { rarity } : {}),
    ...(category ? { category } : {}),
  };
};

const sendCachedJson = (request: Request, response: ExpressResponse, payload: JsonRecord) => {
  const body = JSON.stringify(payload);
  const etag = `"cosmetics-${createHash('sha1').update(body).digest('hex').slice(0, 18)}"`;
  response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  response.set('ETag', etag);
  response.type('application/json');
  if (request.headers['if-none-match'] === etag) return response.status(304).end();
  return response.send(body);
};

const CARD_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_COSMETIC_MEDIA_BYTES = 32 * 1024 * 1024;
const MEDIA_CONTENT_TYPE_PATTERN = /^(?:image|video|audio)\//i;

type CosmeticsRouterOptions = {
  fetchMedia?: (url: string, init?: RequestInit) => Promise<Response>;
};

export function createCosmeticsRouter(
  service: CosmeticsDataService,
  options: CosmeticsRouterOptions = {},
): Router {
  const router = Router();
  const kindPattern = ':kind(heroes|coins|pets)';

  router.get('/cosmetics/media', async (request, response) => {
    const mediaUrl = normalizeCosmeticMediaUrl(request.query.url);
    if (!mediaUrl) return response.status(400).json({ error: 'Некорректный адрес медиа' });
    if (!options.fetchMedia) return response.status(503).json({ error: 'Медиапрокси недоступен' });

    try {
      const upstream = await options.fetchMedia(mediaUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)',
          ...(request.headers.range ? { Range: request.headers.range } : {}),
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      const finalUrl = normalizeCosmeticMediaUrl(upstream.url || mediaUrl);
      const contentType = cleanText(upstream.headers.get('content-type'), 160).toLowerCase();
      const contentLength = Number(upstream.headers.get('content-length'));
      if (
        !upstream.ok
        || !finalUrl
        || !MEDIA_CONTENT_TYPE_PATTERN.test(contentType)
        || (Number.isFinite(contentLength) && contentLength > MAX_COSMETIC_MEDIA_BYTES)
      ) {
        await upstream.body?.cancel();
        return response.status(502).json({ error: 'Медиаисточник вернул некорректный ответ' });
      }

      response.status(upstream.status);
      response.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      response.set('Content-Type', contentType);
      response.set('Cross-Origin-Resource-Policy', 'same-origin');
      response.set('X-Content-Type-Options', 'nosniff');
      for (const header of ['accept-ranges', 'content-length', 'content-range', 'etag', 'last-modified'] as const) {
        const value = upstream.headers.get(header);
        if (value) response.set(header, value);
      }
      if (!upstream.body) return response.end();
      let streamedBytes = 0;
      const sizeLimiter = new Transform({
        transform(chunk, _encoding, callback) {
          streamedBytes += chunk.length;
          if (streamedBytes > MAX_COSMETIC_MEDIA_BYTES) {
            callback(new Error('Cosmetic media exceeded the streaming size limit'));
            return;
          }
          callback(null, chunk);
        },
      });
      const stream = Readable.fromWeb(upstream.body as any);
      const handleStreamError = (error: Error) => {
        console.warn('[cosmetics] media stream interrupted', mediaUrl, error);
        response.destroy(error as Error);
      };
      stream.on('error', handleStreamError);
      sizeLimiter.on('error', handleStreamError);
      response.once('close', () => {
        stream.destroy();
        sizeLimiter.destroy();
      });
      return stream.pipe(sizeLimiter).pipe(response);
    } catch (error) {
      console.warn('[cosmetics] media unavailable', mediaUrl, error);
      return response.status(502).json({ error: 'Медиаисточник временно недоступен' });
    }
  });

  router.get(`/cosmetics/${kindPattern}`, async (request, response) => {
    const kind = String(request.params.kind) as CosmeticKind;
    const query = readCatalogQuery(request, kind);
    if (!query) return response.status(400).json({ error: 'Некорректные параметры каталога' });
    try {
      return sendCachedJson(request, response, await service.loadCatalog(kind, query));
    } catch (error) {
      console.warn('[cosmetics] catalog unavailable', kind, error);
      return response.status(502).json({ error: 'Источник косметики временно недоступен' });
    }
  });

  router.get(`/cosmetics/${kindPattern}/:cardId`, async (request, response) => {
    const kind = String(request.params.kind) as CosmeticKind;
    const cardId = cleanText(request.params.cardId, 100);
    if (!CARD_ID_PATTERN.test(cardId)) return response.status(400).json({ error: 'Некорректный идентификатор' });
    try {
      const detail = await service.loadDetail(kind, cardId);
      return detail
        ? sendCachedJson(request, response, detail)
        : response.status(404).json({ error: 'Объект косметики не найден' });
    } catch (error: any) {
      if (Number(error?.status) === 404) return response.status(404).json({ error: 'Объект косметики не найден' });
      console.warn('[cosmetics] detail unavailable', kind, cardId, error);
      return response.status(502).json({ error: 'Источник косметики временно недоступен' });
    }
  });

  return router;
}
