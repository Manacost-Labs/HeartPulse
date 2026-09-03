import { Router, type RequestHandler, type Response } from 'express';
import { extractConstructedCardFrontendAssets } from './constructedCardSeoRoutes.js';
import { sameOriginPublicResourceUrl } from '../shared/publicResourceUrl.js';

type JsonRecord = Record<string, unknown>;

export type PublicBattlegroundHero = {
  dbfId: number;
  cardId: string | null;
  name: string;
  image: string | null;
  heroPower: {
    name: string;
    text: string | null;
    image: string | null;
  } | null;
};

export type BattlegroundHeroSeoRouterDependencies = {
  fetchImpl?: typeof fetch;
  canonicalOrigin?: string;
  frontendAssets?: string;
  catalogTimeoutMs?: number;
  retryAfterSeconds?: number;
  onError?: (error: unknown) => void;
};

const CATALOG_URL = 'http://127.0.0.1:3108/api/bg/heroes';
const DUOS_CATALOG_URL = `${CATALOG_URL}?mode=duos`;
const HERO_LIBRARY_URL = 'https://api.kolodahearthstone.com/api/v1/heroes';
const CANONICAL_ORIGIN = 'https://hearthpulse.net';
const INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const NOINDEX_ROBOTS = 'noindex, nofollow';

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown, maximum = 500): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function plainCatalogText(value: unknown, maximum = 500): string | null {
  const normalized = text(value, maximum * 2);
  if (!normalized) return null;
  const plain = normalized
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[[^\]]+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain ? plain.slice(0, maximum) : null;
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

function safeImageUrl(value: string | null, origin: string): string {
  const fallback = `${origin}/assets/og-preview.png`;
  return sameOriginPublicResourceUrl(value, origin, fallback) ?? fallback;
}

function isPositiveDbfId(value: unknown): boolean {
  const raw = String(value ?? '');
  const parsed = Number(raw);
  return /^[1-9][0-9]*$/.test(raw) && Number.isSafeInteger(parsed) && parsed > 0;
}

export function projectPublicBattlegroundHero(value: unknown): PublicBattlegroundHero | null {
  const hero = record(value);
  if (!isPositiveDbfId(hero.dbfId)) return null;
  const name = plainCatalogText(hero.hero ?? hero.name, 180);
  if (!name) return null;

  const heroPower = record(hero.hero_power);
  const powerCard = record(heroPower.card);
  const powerName = plainCatalogText(powerCard.name, 180);
  return {
    dbfId: Number(hero.dbfId),
    cardId: text(hero.id, 100),
    name,
    image: text(hero.image, 1_000),
    heroPower: powerName
      ? {
          name: powerName,
          text: plainCatalogText(powerCard.text, 500),
          image: text(powerCard.image, 1_000),
        }
      : null,
  };
}

function parseCatalog(payload: unknown): PublicBattlegroundHero[] {
  const root = record(payload);
  if (root.ok === false) throw new Error('Battleground hero catalog reported an error');
  const heroes = Array.isArray(root.heroes) ? root.heroes : record(root.view).heroes;
  if (!Array.isArray(heroes) || heroes.length === 0) {
    throw new Error('Invalid or empty battleground hero catalog');
  }

  const projected = heroes.map(projectPublicBattlegroundHero);
  if (projected.some(hero => hero === null)) {
    throw new Error('Battleground hero catalog contains invalid entities');
  }
  const result = projected as PublicBattlegroundHero[];
  const uniqueIds = new Set(result.map(hero => String(hero.dbfId)));
  if (uniqueIds.size !== result.length) {
    throw new Error('Battleground hero catalog contains duplicate identifiers');
  }
  return result;
}

function projectLibraryHero(value: unknown): PublicBattlegroundHero | null {
  const hero = record(value);
  if (!isPositiveDbfId(hero.dbf)) return null;
  const names = record(hero.name);
  const images = record(hero.images);
  const power = record(hero.hero_power);
  const powerCard = record(power.card);
  const name = plainCatalogText(names.ru ?? names.en, 180);
  if (!name) return null;
  const powerName = plainCatalogText(powerCard.name, 180);
  return {
    dbfId: Number(hero.dbf),
    cardId: text(hero.card_id, 100),
    name,
    image: text(images.hero, 1_000),
    heroPower: powerName
      ? {
          name: powerName,
          text: plainCatalogText(powerCard.text, 500),
          image: text(powerCard.image, 1_000),
        }
      : null,
  };
}

function mergeLibraryHero(hero: PublicBattlegroundHero, payload: unknown): PublicBattlegroundHero {
  const root = record(payload);
  const rows = Array.isArray(root.data) ? root.data : [];
  const localized = rows.map(projectLibraryHero).find(candidate => candidate?.dbfId === hero.dbfId);
  if (!localized) return hero;
  return {
    dbfId: hero.dbfId,
    cardId: localized.cardId || hero.cardId,
    name: localized.name || hero.name,
    image: localized.image || hero.image,
    heroPower: localized.heroPower || hero.heroPower,
  };
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
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="HearthPulse">
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
  const structuredData = options.structuredData === undefined
    ? ''
    : `
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
      .bg-hero-seo{box-sizing:border-box;max-width:1040px;margin:0 auto;padding:32px 20px;font-family:Inter,system-ui,sans-serif;color:#2b1b16}
      .bg-hero-seo a{color:#7b1f2d}.bg-hero-seo__hero{display:grid;grid-template-columns:minmax(220px,360px) 1fr;gap:32px;align-items:start}
      .bg-hero-seo__image,.bg-hero-seo__power-image{display:block;width:100%;height:auto;max-height:520px;object-fit:contain}.bg-hero-seo h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.05;margin:.35em 0}
      .bg-hero-seo dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.bg-hero-seo dl div{padding:10px;background:#f3e0b9;border:1px solid #b68a4f}
      .bg-hero-seo dt{font-size:.8rem;color:#69482e}.bg-hero-seo dd{margin:2px 0 0;font-weight:700}.bg-hero-seo__power{margin-top:24px;padding:18px;border:1px solid #b68a4f;background:#f7e9c9}
      .bg-hero-seo__links{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.bg-hero-seo__links a{padding:10px 12px;border:1px solid #b68a4f;background:#fffaf0}
      .bg-hero-seo__power-image{max-width:220px;max-height:300px}.bg-hero-seo__copy{font-size:1.05rem;line-height:1.6}
      @media(max-width:680px){.bg-hero-seo__hero{grid-template-columns:1fr}.bg-hero-seo__image{max-height:420px}.bg-hero-seo dl{grid-template-columns:1fr}}
    </style>
  </head>
  <body>
    <div id="root" data-route-status="${options.routeStatus}">${options.body}</div>
  </body>
</html>`;
}

function descriptionForHero(hero: PublicBattlegroundHero): string {
  if (hero.heroPower?.text) {
    return `${hero.name} — герой Полей сражений Hearthstone. Сила героя «${hero.heroPower.name}»: ${hero.heroPower.text}`.slice(0, 300);
  }
  if (hero.heroPower) {
    return `${hero.name} — герой Полей сражений Hearthstone. Сила героя: «${hero.heroPower.name}».`.slice(0, 300);
  }
  return `${hero.name} — герой режима «Поля сражений» в Hearthstone. Публичная информация о герое на HearthPulse.`.slice(0, 300);
}

function renderHeroDocument(
  hero: PublicBattlegroundHero,
  origin: string,
  frontendAssets: string,
): string {
  const canonical = `${origin}/heroes/${hero.dbfId}/`;
  const image = safeImageUrl(hero.image, origin);
  const heroPowerImage = hero.heroPower ? safeImageUrl(hero.heroPower.image, origin) : null;
  const title = `${hero.name} — герой Полей сражений Hearthstone | HearthPulse`;
  const description = descriptionForHero(hero);
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        inLanguage: 'ru',
        isPartOf: { '@type': 'WebSite', '@id': `${origin}/#website`, name: 'HearthPulse', url: `${origin}/` },
        primaryImageOfPage: { '@type': 'ImageObject', contentUrl: image },
        mainEntity: { '@id': `${canonical}#hero` },
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
      },
      {
        '@type': 'CreativeWork',
        '@id': `${canonical}#hero`,
        url: canonical,
        name: hero.name,
        identifier: hero.dbfId,
        ...(hero.cardId ? { alternateName: hero.cardId } : {}),
        image,
        description,
        inLanguage: 'ru',
        isPartOf: { '@type': 'VideoGame', name: 'Hearthstone: Поля сражений' },
        ...(hero.heroPower ? {
          about: {
            '@type': 'CreativeWork',
            name: hero.heroPower.name,
            ...(hero.heroPower.text ? { description: hero.heroPower.text } : {}),
            ...(heroPowerImage ? { image: heroPowerImage } : {}),
          },
        } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Герои Полей сражений', item: `${origin}/heroes/` },
          { '@type': 'ListItem', position: 3, name: hero.name, item: canonical },
        ],
      },
    ],
  };
  const power = hero.heroPower
    ? `<section class="bg-hero-seo__power">
            <h2>Сила героя</h2>
            <h3>${escapeHtml(hero.heroPower.name)}</h3>
            ${heroPowerImage ? `<img class="bg-hero-seo__power-image" src="${escapeHtml(heroPowerImage)}" alt="Сила героя «${escapeHtml(hero.heroPower.name)}»">` : ''}
            ${hero.heroPower.text ? `<p class="bg-hero-seo__copy">${escapeHtml(hero.heroPower.text)}</p>` : ''}
          </section>`
    : '';
  const body = `<main class="bg-hero-seo">
      <nav aria-label="Хлебные крошки"><a href="/heroes/">Герои Полей сражений</a></nav>
      <article class="bg-hero-seo__hero">
        <img class="bg-hero-seo__image" src="${escapeHtml(image)}" alt="Герой Полей сражений «${escapeHtml(hero.name)}»">
        <div>
          <p>Поля сражений</p>
          <h1>${escapeHtml(hero.name)}</h1>
          <dl>
            <div><dt>DBF ID</dt><dd><code>${hero.dbfId}</code></dd></div>
            ${hero.cardId ? `<div><dt>ID карты</dt><dd><code>${escapeHtml(hero.cardId)}</code></dd></div>` : ''}
          </dl>
          ${power}
        </div>
      </article>
      <nav class="bg-hero-seo__links" aria-label="Связанные разделы">
        <a href="/heroes/">Все герои БГ</a>
        <a href="/battlegrounds/tier-list/">Тир-лист БГ</a>
        <a href="/library/">Библиотека БГ</a>
      </nav>
    </main>`;
  return renderDocument({
    title,
    description,
    robots: INDEX_ROBOTS,
    routeStatus: '200',
    canonical,
    image,
    structuredData,
    structuredDataPath: `/heroes/${hero.dbfId}`,
    body,
    frontendAssets,
  });
}

function renderNoindexDocument(options: {
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
    body: `<main class="bg-hero-seo"><h1>${escapeHtml(options.heading)}</h1><p>${escapeHtml(options.message)}</p><p><a href="/heroes/">Вернуться к героям Полей сражений</a></p></main>`,
  });
}

function sendHtml(response: Response, status: number, robots: string, html: string): Response {
  response.status(status);
  response.set('Content-Type', 'text/html; charset=utf-8');
  response.set('X-Robots-Tag', robots);
  response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response.send(html);
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Battleground hero catalog deadline exceeded'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createBattlegroundHeroSeoRouter(
  dependencies: BattlegroundHeroSeoRouterDependencies = {},
): Router {
  const router = Router({ caseSensitive: true, strict: true });
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const origin = normalizeCanonicalOrigin(dependencies.canonicalOrigin);
  const frontendAssets = dependencies.frontendAssets ?? '';
  const catalogTimeoutMs = Math.max(1, Math.min(25_000, Math.floor(dependencies.catalogTimeoutMs ?? 20_000)));
  const retryAfterSeconds = Math.max(1, Math.floor(dependencies.retryAfterSeconds ?? 300));

  const handler: RequestHandler = async (request, response) => {
    const dbfId = String(request.params.dbfId ?? '');
    if (!/^[1-9][0-9]*$/.test(dbfId)) {
      return sendHtml(response, 404, NOINDEX_ROBOTS, renderNoindexDocument({
        title: 'Герой не найден | HearthPulse',
        description: 'Запрошенный герой Полей сражений Hearthstone не найден.',
        heading: 'Герой не найден',
        message: 'Проверьте адрес или вернитесь к списку героев.',
        routeStatus: '404',
      }));
    }

    const controller = new AbortController();
    try {
      const fetchCatalog = async (url: string): Promise<PublicBattlegroundHero[]> => {
        const upstream = await fetchImpl(url, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'HearthPulse/BattlegroundHeroSEO',
          },
        });
        if (!upstream.ok) throw new Error(`Battleground hero catalog HTTP ${upstream.status}`);
        return parseCatalog(await upstream.json());
      };
      const soloHeroes = await withDeadline(fetchCatalog(CATALOG_URL), catalogTimeoutMs, controller);
      let hero = soloHeroes.find(candidate => String(candidate.dbfId) === dbfId);
      if (!hero) {
        const duoHeroes = await withDeadline(fetchCatalog(DUOS_CATALOG_URL), catalogTimeoutMs, controller);
        hero = duoHeroes.find(candidate => String(candidate.dbfId) === dbfId);
        if (hero) {
          try {
            const libraryUrl = new URL(HERO_LIBRARY_URL);
            libraryUrl.searchParams.set('dbf', dbfId);
            const libraryResponse = await withDeadline(fetchImpl(libraryUrl, {
              signal: controller.signal,
              headers: {
                Accept: 'application/json',
                'User-Agent': 'HearthPulse/BattlegroundHeroSEO',
              },
            }), catalogTimeoutMs, controller);
            if (libraryResponse.ok) hero = mergeLibraryHero(hero, await libraryResponse.json());
          } catch (libraryError) {
            try {
              dependencies.onError?.(libraryError);
            } catch {
              // Optional localization diagnostics must not replace a valid hero page.
            }
          }
        }
      }
      if (!hero) {
        return sendHtml(response, 404, NOINDEX_ROBOTS, renderNoindexDocument({
          title: 'Герой не найден | HearthPulse',
          description: 'Запрошенный герой Полей сражений Hearthstone не найден.',
          heading: 'Герой не найден',
          message: 'Такого героя нет в текущем каталоге Полей сражений.',
          routeStatus: '404',
        }));
      }
      return sendHtml(response, 200, INDEX_ROBOTS, renderHeroDocument(hero, origin, frontendAssets));
    } catch (error) {
      try {
        dependencies.onError?.(error);
      } catch {
        // Diagnostics are best-effort and must never replace the authoritative
        // retryable HTML response with an unrelated middleware error.
      }
      response.set('Retry-After', String(retryAfterSeconds));
      return sendHtml(response, 503, NOINDEX_ROBOTS, renderNoindexDocument({
        title: 'Каталог героев временно недоступен | HearthPulse',
        description: 'Каталог героев Полей сражений Hearthstone временно недоступен. Попробуйте открыть страницу позже.',
        heading: 'Каталог героев временно недоступен',
        message: 'Мы не смогли проверить каталог героев. Попробуйте снова через несколько минут.',
        routeStatus: '503',
      }));
    }
  };

  router.get('/heroes/:dbfId/', handler);
  return router;
}
