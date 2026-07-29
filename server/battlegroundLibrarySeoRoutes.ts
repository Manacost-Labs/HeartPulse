import { Router, type Request, type RequestHandler, type Response } from 'express';
import { extractConstructedCardFrontendAssets } from './constructedCardSeoRoutes.js';
import { sameOriginPublicResourceUrl } from '../shared/publicResourceUrl.js';

type JsonRecord = Record<string, unknown>;
type BattlegroundLibraryKind = 'minion' | 'spell';

type PublicBattlegroundLibraryCard = {
  dbfId: number;
  kind: BattlegroundLibraryKind;
  typeName: string;
  nameRu: string;
  nameEn: string | null;
  textRu: string | null;
  textEn: string | null;
  tavernTier: number | null;
  tribe: string | null;
  attack: number | null;
  health: number | null;
  mechanics: string[];
  images: {
    card: string | null;
    golden: string | null;
    art: string | null;
    framed: string | null;
    crop: string | null;
  };
  artist: string | null;
  inPool: boolean;
};

export type BattlegroundLibrarySeoRouterDependencies = {
  fetchImpl?: typeof fetch;
  canonicalOrigin?: string;
  frontendAssets?: string;
  catalogTimeoutMs?: number;
  catalogCacheTtlMs?: number;
  retryAfterSeconds?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

const CATALOG_ORIGIN = 'http://127.0.0.1:3108';
const CANONICAL_ORIGIN = 'https://arena.hs-manacost.ru';
const INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const NOINDEX_ROBOTS = 'noindex, nofollow';
const CARD_NAME_OVERRIDES: Record<string, string> = {
  'bacon blood gem': 'Кровавые самоцветы',
  'bacon pass tooltip': 'Передача карт',
  'bacon refresh': 'Обновление таверны',
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function compactText(value: unknown, maximum = 500): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function plainCatalogText(value: unknown, maximum = 500): string | null {
  const normalized = compactText(value, maximum * 2);
  if (!normalized) return null;
  const plain = normalized
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[x\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain ? plain.slice(0, maximum) : null;
}

function rawCatalogText(value: unknown, maximum = 500): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).replace(/\r\n?/g, '\n').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCanonicalOrigin(value: string | undefined): string {
  try {
    const parsed = new URL(value ?? CANONICAL_ORIGIN);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return CANONICAL_ORIGIN;
    return parsed.origin;
  } catch {
    return CANONICAL_ORIGIN;
  }
}

function safeOptionalImageUrl(value: string | null, origin: string): string | null {
  return sameOriginPublicResourceUrl(value, origin);
}

function safePrimaryImageUrl(value: string | null, origin: string): string {
  return safeOptionalImageUrl(value, origin) ?? `${origin}/assets/og-preview.png`;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPositiveDbfId(value: unknown): boolean {
  const raw = String(value ?? '');
  const parsed = Number(raw);
  return /^[1-9][0-9]*$/.test(raw) && Number.isSafeInteger(parsed) && parsed > 0;
}

function cleanSearch(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/ё/g, 'е').trim();
}

function canonicalSlug(value: string): string {
  return cleanSearch(value)
    .replace(/['’]/g, '')
    .replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'card';
}

function publicName(card: JsonRecord): { ru: string; en: string | null } | null {
  const names = record(card.name);
  const ru = plainCatalogText(names.ru, 180);
  const en = plainCatalogText(names.en, 180);
  const cardId = plainCatalogText(card.card_id, 100);
  const overrideKeys = [ru, en, cardId].map(cleanSearch);
  const override = overrideKeys.map(key => CARD_NAME_OVERRIDES[key]).find(Boolean);
  const nameRu = override ?? ru ?? en ?? cardId;
  if (!nameRu) return null;
  return { ru: nameRu, en: en && en !== nameRu ? en : null };
}

function splitLegacyText(value: unknown): { ru: string | null; en: string | null } {
  if (typeof value !== 'string') return { ru: null, en: null };
  const normalized = value.replace(/\r\n?/g, '\n');
  const englishMarker = normalized.search(/\n\s*EN:\s*/i);
  const mechanicMarker = normalized.search(/\n\s*Механики:\s*/i);
  const ruEndCandidates = [englishMarker, mechanicMarker].filter(index => index >= 0);
  const ruEnd = ruEndCandidates.length ? Math.min(...ruEndCandidates) : normalized.length;
  const english = englishMarker >= 0
    ? normalized.slice(englishMarker).replace(/^\n\s*EN:\s*/i, '')
    : '';
  return {
    ru: plainCatalogText(normalized.slice(0, ruEnd), 1_000),
    en: plainCatalogText(english, 1_000),
  };
}

function publicRulesText(card: JsonRecord): { ru: string | null; en: string | null } {
  const rules = record(card.text);
  const structuredRu = plainCatalogText(rules.ru, 1_000);
  const structuredEn = plainCatalogText(rules.en, 1_000);
  const legacy = splitLegacyText(card.text_ru);
  return {
    ru: structuredRu ?? legacy.ru,
    en: structuredEn ?? legacy.en,
  };
}

function publicMechanics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const mechanics: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const mechanic = record(raw);
    const label = plainCatalogText(mechanic.name_ru ?? mechanic.name_en ?? mechanic.slug ?? raw, 120);
    if (!label) continue;
    const key = cleanSearch(mechanic.slug ?? label).replace(/[^a-zа-я0-9]+/g, '_');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    mechanics.push(label);
  }
  return mechanics.slice(0, 40);
}

function projectCard(
  value: unknown,
  expectedKind: BattlegroundLibraryKind,
  expectedPool: boolean,
): PublicBattlegroundLibraryCard | null {
  const card = record(value);
  if (!isPositiveDbfId(card.dbf)) return null;
  const cardType = record(card.card_type);
  if (compactText(cardType.slug, 40)?.toLowerCase() !== expectedKind) return null;
  if (typeof card.in_pool !== 'boolean' || card.in_pool !== expectedPool) return null;
  const name = publicName(card);
  if (!name) return null;
  const rules = publicRulesText(card);
  const creatureType = record(card.creature_type);
  const images = record(card.images);
  return {
    dbfId: Number(card.dbf),
    kind: expectedKind,
    typeName: plainCatalogText(cardType.name_ru, 100)
      ?? (expectedKind === 'minion' ? 'Существо' : 'Заклинание'),
    nameRu: name.ru,
    nameEn: name.en,
    textRu: rules.ru,
    textEn: rules.en,
    tavernTier: finiteNumber(card.tavern_tier),
    tribe: plainCatalogText(creatureType.name_ru ?? card.minion_type ?? card.race, 120),
    attack: finiteNumber(card.attack),
    health: finiteNumber(card.health),
    mechanics: publicMechanics(card.mechanics),
    images: {
      card: compactText(images.card, 1_000),
      golden: compactText(images.golden, 1_000),
      art: compactText(images.art, 1_000),
      framed: compactText(images.framed, 1_000),
      crop: compactText(images.crop, 1_000),
    },
    artist: rawCatalogText(card.artist, 300),
    inPool: card.in_pool,
  };
}

function parseCatalog(
  payload: unknown,
  kind: BattlegroundLibraryKind,
  inPool: boolean,
): PublicBattlegroundLibraryCard[] {
  const root = record(payload);
  if (root.ok === false || !Array.isArray(root.data) || root.data.length === 0) {
    throw new Error(`Invalid or empty battleground ${kind} catalog for pool=${Number(inPool)}`);
  }
  const projected = root.data.map(value => projectCard(value, kind, inPool));
  if (projected.some(card => card === null)) {
    throw new Error(`Battleground ${kind} catalog contains invalid entities for pool=${Number(inPool)}`);
  }
  const cards = projected as PublicBattlegroundLibraryCard[];
  const uniqueIds = new Set(cards.map(card => String(card.dbfId)));
  if (uniqueIds.size !== cards.length) {
    throw new Error(`Battleground ${kind} catalog contains duplicate identifiers for pool=${Number(inPool)}`);
  }
  return cards;
}

function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderDocument(options: {
  title: string;
  description: string;
  robots: string;
  body: string;
  routeStatus: '200' | '404' | '503';
  frontendAssets?: string;
  canonical?: string;
  image?: string;
  structuredData?: unknown;
  structuredDataPath?: string;
}): string {
  const title = escapeHtml(options.title);
  const description = escapeHtml(options.description);
  const canonical = options.canonical ? escapeHtml(options.canonical) : null;
  const image = options.image ? escapeHtml(options.image) : null;
  const frontendAssets = options.routeStatus === '200'
    ? extractConstructedCardFrontendAssets(options.frontendAssets ?? '')
    : '';
  const social = canonical && image ? `
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Manacost Stats">
    <meta property="og:locale" content="ru_RU">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:alt" content="${title}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">
    <meta name="twitter:image:alt" content="${title}">` : '';
  const structuredData = options.structuredData === undefined ? '' : `
    <script type="application/ld+json" data-server-entity-jsonld data-entity-path="${escapeHtml(options.structuredDataPath)}">${jsonLd(options.structuredData)}</script>`;

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="robots" content="${escapeHtml(options.robots)}">
    ${canonical ? `<link rel="canonical" href="${canonical}">` : ''}${social}${structuredData}
    <link rel="icon" type="image/png" href="/favicon-16.png?v=hearthstone-cute-20260727" sizes="16x16">
    <link rel="icon" type="image/png" href="/favicon-32.png?v=hearthstone-cute-20260727" sizes="32x32">
    <link rel="icon" type="image/png" href="/favicon-96.png?v=hearthstone-cute-20260727" sizes="96x96">
    <link rel="icon" type="image/x-icon" href="/favicon.ico?v=hearthstone-cute-20260727">
    <link rel="apple-touch-icon" type="image/png" href="/apple-touch-icon.png?v=hearthstone-cute-20260727" sizes="180x180">
    ${frontendAssets}
    <style>
      .bg-library-seo{box-sizing:border-box;max-width:1080px;margin:0 auto;padding:32px 20px;font-family:Inter,system-ui,sans-serif;color:#2b1b16}
      .bg-library-seo a{color:#7b1f2d}.bg-library-seo__layout{display:grid;grid-template-columns:minmax(240px,360px) 1fr;gap:32px;align-items:start}
      .bg-library-seo__image{display:block;width:100%;height:auto;max-height:520px;object-fit:contain}.bg-library-seo h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.05;margin:.25em 0}
      .bg-library-seo__english{margin-top:0;color:#6a5140}.bg-library-seo dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .bg-library-seo dl div,.bg-library-seo__panel{padding:12px;background:#f3e0b9;border:1px solid #b68a4f}.bg-library-seo dt{font-size:.8rem;color:#69482e}.bg-library-seo dd{margin:2px 0 0;font-weight:700}
      .bg-library-seo__panel{margin-top:18px}.bg-library-seo__copy{font-size:1.05rem;line-height:1.6}.bg-library-seo__mechanics{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}
      .bg-library-seo__mechanics li{padding:7px 10px;border:1px solid #9d713c;background:#fff1cc}.bg-library-seo__gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:28px}
      .bg-library-seo__gallery figure{margin:0;padding:12px;border:1px solid #b68a4f;background:#f7e9c9}.bg-library-seo__gallery img{display:block;width:100%;height:280px;object-fit:contain}.bg-library-seo__gallery figcaption{text-align:center}
      @media(max-width:680px){.bg-library-seo__layout{grid-template-columns:1fr}.bg-library-seo__image{max-height:420px}.bg-library-seo dl{grid-template-columns:1fr}.bg-library-seo__gallery img{height:240px}}
    </style>
  </head>
  <body>
    <div id="root" data-route-status="${options.routeStatus}">${options.body}</div>
  </body>
</html>`;
}

function kindPath(kind: BattlegroundLibraryKind): 'minions' | 'spells' {
  return kind === 'minion' ? 'minions' : 'spells';
}

function kindTitle(kind: BattlegroundLibraryKind): string {
  return kind === 'minion' ? 'существо' : 'заклинание';
}

function descriptionForCard(card: PublicBattlegroundLibraryCard): string {
  const facts = [
    `${card.nameRu} — ${kindTitle(card.kind)} Полей сражений Hearthstone.`,
    card.tavernTier === null ? null : `Уровень таверны: ${card.tavernTier}.`,
    card.tribe ? `Тип существа: ${card.tribe}.` : null,
    card.textRu,
  ].filter(Boolean);
  return facts.join(' ').slice(0, 300);
}

function renderCardDocument(
  card: PublicBattlegroundLibraryCard,
  origin: string,
  frontendAssets: string,
): string {
  const path = `/library/${kindPath(card.kind)}/${canonicalSlug(card.nameRu)}-${card.dbfId}`;
  const canonical = new URL(`${path}/`, origin).href;
  const image = safePrimaryImageUrl(card.images.card ?? card.images.framed, origin);
  const title = `${card.nameRu} — ${kindTitle(card.kind)} Полей сражений Hearthstone | Manacost Stats`;
  const description = descriptionForCard(card);
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CreativeWork',
        '@id': `${canonical}#card`,
        url: canonical,
        name: card.nameRu,
        identifier: card.dbfId,
        ...(card.nameEn ? { alternateName: card.nameEn } : {}),
        image,
        description,
        inLanguage: 'ru',
        isPartOf: { '@type': 'VideoGame', name: 'Hearthstone: Поля сражений' },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Библиотека Полей сражений', item: `${origin}/library/` },
          { '@type': 'ListItem', position: 3, name: card.kind === 'minion' ? 'Существа' : 'Заклинания', item: `${origin}/library/${kindPath(card.kind)}/` },
          { '@type': 'ListItem', position: 4, name: card.nameRu, item: canonical },
        ],
      },
    ],
  };
  const propertyRows = [
    ['DBF ID', String(card.dbfId)],
    ['Тип', card.typeName],
    ...(card.tavernTier === null ? [] : [['Уровень таверны', String(card.tavernTier)]]),
    ...(card.tribe ? [['Тип существа', card.tribe]] : []),
    ...(card.attack === null ? [] : [['Атака', String(card.attack)]]),
    ...(card.health === null ? [] : [['Здоровье', String(card.health)]]),
    ['Статус', card.inPool ? 'В активном пуле' : 'Вне активного пула'],
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  const textPanels = [
    card.textRu ? `<section class="bg-library-seo__panel"><h2>Текст карты</h2><p class="bg-library-seo__copy">${escapeHtml(card.textRu)}</p></section>` : '',
    card.textEn ? `<section class="bg-library-seo__panel" lang="en"><h2>Текст на английском</h2><p class="bg-library-seo__copy">${escapeHtml(card.textEn)}</p></section>` : '',
    card.mechanics.length ? `<section class="bg-library-seo__panel"><h2>Механики</h2><ul class="bg-library-seo__mechanics">${card.mechanics.map(mechanic => `<li>${escapeHtml(mechanic)}</li>`).join('')}</ul></section>` : '',
  ].join('');
  const gallery = [
    ['Обычная карта', card.images.card],
    ['Золотая карта', card.images.golden],
    ['Арт', card.images.art],
    ['Карта в рамке', card.images.framed],
    ['Фрагмент арта', card.images.crop],
  ].map(([label, raw]) => ({ label, image: safeOptionalImageUrl(raw, origin) }))
    .filter((entry): entry is { label: string; image: string } => Boolean(entry.image));
  const uniqueGallery = gallery.filter((entry, index) => gallery.findIndex(candidate => candidate.image === entry.image) === index);
  const galleryHtml = uniqueGallery.length > 1
    ? `<section class="bg-library-seo__gallery" aria-label="Изображения карты">${uniqueGallery.map(entry => `<figure><img src="${escapeHtml(entry.image)}" alt="${escapeHtml(`${entry.label} «${card.nameRu}»`)}"><figcaption>${escapeHtml(entry.label)}</figcaption></figure>`).join('')}</section>`
    : '';
  const body = `<main class="bg-library-seo">
      <nav aria-label="Хлебные крошки"><a href="/library/${kindPath(card.kind)}/">${card.kind === 'minion' ? 'Существа' : 'Заклинания'} Полей сражений</a></nav>
      <article class="bg-library-seo__layout">
        <img class="bg-library-seo__image" src="${escapeHtml(image)}" alt="${escapeHtml(`${card.typeName} «${card.nameRu}»`)}">
        <div>
          <p>Библиотека Полей сражений</p>
          <h1>${escapeHtml(card.nameRu)}</h1>
          ${card.nameEn ? `<p class="bg-library-seo__english" lang="en">${escapeHtml(card.nameEn)}</p>` : ''}
          <dl>${propertyRows}</dl>
          ${textPanels}
          ${card.artist ? `<p><strong>Художник:</strong> ${escapeHtml(card.artist)}</p>` : ''}
        </div>
      </article>
      ${galleryHtml}
    </main>`;
  return renderDocument({
    title,
    description,
    robots: INDEX_ROBOTS,
    routeStatus: '200',
    canonical,
    image,
    structuredData,
    structuredDataPath: path,
    body,
    frontendAssets,
  });
}

function renderNoindexDocument(options: {
  kind: BattlegroundLibraryKind;
  title: string;
  description: string;
  heading: string;
  message: string;
  routeStatus: '404' | '503';
}): string {
  return renderDocument({
    title: options.title,
    description: options.description,
    robots: NOINDEX_ROBOTS,
    routeStatus: options.routeStatus,
    body: `<main class="bg-library-seo"><h1>${escapeHtml(options.heading)}</h1><p>${escapeHtml(options.message)}</p><p><a href="/library/${kindPath(options.kind)}/">Вернуться в библиотеку Полей сражений</a></p></main>`,
  });
}

function sendHtml(response: Response, status: number, robots: string, html: string): Response {
  response.status(status);
  response.set('Content-Type', 'text/html; charset=utf-8');
  response.set('X-Robots-Tag', robots);
  response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response.send(html);
}

function sendCanonicalRedirect(response: Response, location: string): Response {
  response.status(301);
  response.set('Location', location);
  response.set('X-Robots-Tag', NOINDEX_ROBOTS);
  response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response.send('');
}

function parseDetailParameter(value: unknown): { slug: string; dbfId: number } | null {
  const raw = String(value ?? '');
  if (!raw || raw.length > 180 || raw.includes('/') || raw.includes('\\')) return null;
  const match = raw.match(/^(.+)-([1-9][0-9]*)$/u);
  if (!match || !match[1] || match[1].length > 80 || !isPositiveDbfId(match[2])) return null;
  return { slug: match[1], dbfId: Number(match[2]) };
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Battleground library catalog deadline exceeded'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function catalogUrl(kind: BattlegroundLibraryKind, inPool: boolean): string {
  return `${CATALOG_ORIGIN}/api/bg/library/cards?card_type=${kind}&in_pool=${Number(inPool)}`;
}

function originalSearch(request: Request, origin: string): string {
  try {
    return new URL(request.originalUrl, origin).search;
  } catch {
    return '';
  }
}

export function createBattlegroundLibrarySeoRouter(
  dependencies: BattlegroundLibrarySeoRouterDependencies = {},
): Router {
  const router = Router({ caseSensitive: true, strict: true });
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const origin = normalizeCanonicalOrigin(dependencies.canonicalOrigin);
  const frontendAssets = dependencies.frontendAssets ?? '';
  const catalogTimeoutMs = Math.max(1, Math.min(25_000, Math.floor(dependencies.catalogTimeoutMs ?? 20_000)));
  const catalogCacheTtlMs = Math.max(1, Math.min(3_600_000, Math.floor(dependencies.catalogCacheTtlMs ?? 300_000)));
  const retryAfterSeconds = Math.max(1, Math.floor(dependencies.retryAfterSeconds ?? 300));
  const now = dependencies.now ?? Date.now;
  const catalogCache = new Map<BattlegroundLibraryKind, {
    expiresAt: number;
    cards: PublicBattlegroundLibraryCard[];
  }>();
  const catalogInflight = new Map<BattlegroundLibraryKind, Promise<PublicBattlegroundLibraryCard[]>>();

  const loadCatalog = (kind: BattlegroundLibraryKind): Promise<PublicBattlegroundLibraryCard[]> => {
    const cached = catalogCache.get(kind);
    if (cached && cached.expiresAt > now()) return Promise.resolve(cached.cards);
    const inflight = catalogInflight.get(kind);
    if (inflight) return inflight;

    const controller = new AbortController();
    const pending = withDeadline(Promise.all([true, false].map(async inPool => {
      const upstream = await fetchImpl(catalogUrl(kind, inPool), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ManacostArena/BattlegroundLibrarySEO',
        },
      });
      if (!upstream.ok) throw new Error(`Battleground ${kind} catalog HTTP ${upstream.status}`);
      return parseCatalog(await upstream.json(), kind, inPool);
    })), catalogTimeoutMs, controller).then(catalogs => {
      const cards = catalogs.flat();
      const uniqueIds = new Set(cards.map(card => String(card.dbfId)));
      if (uniqueIds.size !== cards.length) {
        throw new Error(`Battleground ${kind} active/archive catalogs contain conflicting identifiers`);
      }
      catalogCache.set(kind, { cards, expiresAt: now() + catalogCacheTtlMs });
      return cards;
    }).finally(() => {
      if (catalogInflight.get(kind) === pending) catalogInflight.delete(kind);
    });
    catalogInflight.set(kind, pending);
    return pending;
  };

  const handlerFor = (kind: BattlegroundLibraryKind): RequestHandler => async (request, response) => {
    const detail = parseDetailParameter(request.params.slugAndDbfId);
    if (!detail) {
      return sendHtml(response, 404, NOINDEX_ROBOTS, renderNoindexDocument({
        kind,
        title: 'Карта не найдена | Manacost Stats',
        description: 'Запрошенная карта Полей сражений Hearthstone не найдена.',
        heading: 'Карта не найдена',
        message: 'Проверьте адрес или вернитесь в библиотеку.',
        routeStatus: '404',
      }));
    }

    try {
      const cards = await loadCatalog(kind);
      const card = cards.find(candidate => candidate.dbfId === detail.dbfId);
      if (!card) {
        return sendHtml(response, 404, NOINDEX_ROBOTS, renderNoindexDocument({
          kind,
          title: 'Карта не найдена | Manacost Stats',
          description: 'Запрошенная карта Полей сражений Hearthstone не найдена.',
          heading: 'Карта не найдена',
          message: 'Такой карты нет в проверенных каталогах Полей сражений.',
          routeStatus: '404',
        }));
      }

      const canonicalPath = `/library/${kindPath(kind)}/${canonicalSlug(card.nameRu)}-${card.dbfId}/`;
      if (detail.slug !== canonicalSlug(card.nameRu)) {
        const location = `${new URL(canonicalPath, origin).href}${originalSearch(request, origin)}`;
        return sendCanonicalRedirect(response, location);
      }
      return sendHtml(response, 200, INDEX_ROBOTS, renderCardDocument(card, origin, frontendAssets));
    } catch (error) {
      try {
        dependencies.onError?.(error);
      } catch {
        // Diagnostics are best-effort and cannot replace the retryable page.
      }
      response.set('Retry-After', String(retryAfterSeconds));
      return sendHtml(response, 503, NOINDEX_ROBOTS, renderNoindexDocument({
        kind,
        title: 'Каталог карт временно недоступен | Manacost Stats',
        description: 'Каталог карт Полей сражений Hearthstone временно недоступен. Попробуйте открыть страницу позже.',
        heading: 'Каталог карт временно недоступен',
        message: 'Мы не смогли проверить каталог карт. Попробуйте снова через несколько минут.',
        routeStatus: '503',
      }));
    }
  };

  router.get('/library/minions/:slugAndDbfId/', handlerFor('minion'));
  router.get('/library/spells/:slugAndDbfId/', handlerFor('spell'));
  return router;
}
