import { Router, type RequestHandler, type Response } from 'express';
import type { CosmeticKind, CosmeticsDataService } from './cosmeticsRoutes.js';
import { sameOriginPublicResourceUrl } from '../shared/publicResourceUrl.js';

type JsonRecord = Record<string, any>;

export type CosmeticsSeoRouterDependencies = Pick<CosmeticsDataService, 'loadDetail'> & {
  canonicalOrigin?: string;
  frontendAssets?: string;
  timeoutMs?: number;
  onError?: (error: unknown) => void;
};

const INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const NOINDEX_ROBOTS = 'noindex, nofollow';
const CARD_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const KINDS = new Set<CosmeticKind>(['heroes', 'coins', 'pets']);

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function canonicalOrigin(value: string | undefined): string {
  try {
    const parsed = new URL(value ?? 'https://hearthpulse.net');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.origin
      : 'https://hearthpulse.net';
  } catch {
    return 'https://hearthpulse.net';
  }
}

function text(value: unknown, maximum = 300): string | null {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function detailProjection(kind: CosmeticKind, detail: JsonRecord) {
  if (kind === 'heroes') {
    return {
      name: text(detail?.name?.ru) ?? text(detail?.name?.en) ?? text(detail?.cardId) ?? 'Скин героя',
      englishName: text(detail?.name?.en),
      description: `Скин героя Hearthstone: ${text(detail?.class?.nameRu) ?? 'класс не указан'}, ${text(detail?.rarity?.nameRu) ?? 'редкость не указана'}. Анимация, полный арт и звуковые дорожки.`,
      image: text(detail?.images?.static ?? detail?.images?.fullArt, 2_000),
      typeLabel: 'Скин героя',
      artist: text(detail?.artist),
    };
  }
  if (kind === 'coins') {
    const name = text(detail?.name?.en) ?? text(detail?.name?.ru) ?? text(detail?.cardId) ?? 'Косметическая монета';
    return {
      name,
      englishName: null,
      description: `Косметическая монета Hearthstone «${name}»: изображение карты, crop-арт и связанные карты.`,
      image: text(detail?.images?.crop ?? detail?.images?.card, 2_000),
      typeLabel: 'Косметическая монета',
      artist: text(detail?.artist),
    };
  }
  const name = text(detail?.name) ?? text(detail?.cardId) ?? 'Питомец';
  return {
    name,
    englishName: null,
    description: `Питомец Hearthstone «${name}»: карточка, End Screen, дополнительные арты и другие раскраски семейства.`,
    image: text(detail?.images?.card ?? detail?.images?.endScreen, 2_000),
    typeLabel: 'Питомец',
    artist: null,
  };
}

function baseDocument(options: {
  title: string;
  description: string;
  robots: string;
  canonical?: string;
  image?: string | null;
  body: string;
  frontendAssets?: string;
  structuredData?: JsonRecord;
  routeStatus: '200' | '404' | '503';
}) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
  <meta name="description" content="${escapeHtml(options.description)}">
  <meta name="robots" content="${escapeHtml(options.robots)}">
  <meta property="og:title" content="${escapeHtml(options.title)}">
  <meta property="og:description" content="${escapeHtml(options.description)}">
  <meta property="og:type" content="article">
  ${options.canonical ? `<link rel="canonical" href="${escapeHtml(options.canonical)}">` : ''}
  ${options.image ? `<meta property="og:image" content="${escapeHtml(options.image)}">` : ''}
  ${options.structuredData ? `<script type="application/ld+json" data-server-entity-jsonld>${safeJson(options.structuredData)}</script>` : ''}
  ${options.frontendAssets ?? ''}
</head>
<body data-route-status="${options.routeStatus}">
  <div id="root">${options.body}</div>
</body>
</html>`;
}

function renderDetailDocument(options: {
  kind: CosmeticKind;
  cardId: string;
  detail: JsonRecord;
  origin: string;
  frontendAssets: string;
}) {
  const projection = detailProjection(options.kind, options.detail);
  const canonical = `${options.origin}/cosmetics/${options.kind}/${encodeURIComponent(options.cardId)}/`;
  const title = `${projection.name} — косметика Hearthstone | Manacost`;
  const image = sameOriginPublicResourceUrl(projection.image, options.origin);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: projection.name,
    alternateName: projection.englishName ?? undefined,
    description: projection.description,
    image: image ?? undefined,
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'card_id', value: options.cardId },
      ...(Number.isInteger(options.detail?.dbf)
        ? [{ '@type': 'PropertyValue', propertyID: 'dbf', value: options.detail.dbf }]
        : []),
    ],
    creator: projection.artist ? { '@type': 'Person', name: projection.artist } : undefined,
    url: canonical,
  };
  return baseDocument({
    title,
    description: projection.description,
    robots: INDEX_ROBOTS,
    canonical,
    image,
    frontendAssets: options.frontendAssets,
    structuredData,
    routeStatus: '200',
    body: `<main class="cosmetics-seo">
      <nav aria-label="Хлебные крошки"><a href="/cosmetics/${options.kind}/">Косметика Hearthstone</a></nav>
      <article>
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(projection.typeLabel)} «${escapeHtml(projection.name)}»">` : ''}
        <div>
          <p>${escapeHtml(projection.typeLabel)}</p>
          <h1>${escapeHtml(projection.name)}</h1>
          ${projection.englishName && projection.englishName !== projection.name ? `<p lang="en">${escapeHtml(projection.englishName)}</p>` : ''}
          <dl>
            <div><dt>ID</dt><dd>${escapeHtml(options.cardId)}</dd></div>
            <div><dt>DBF</dt><dd>${escapeHtml(options.detail?.dbf ?? '—')}</dd></div>
          </dl>
          <p>${escapeHtml(projection.description)}</p>
        </div>
      </article>
    </main>`,
  });
}

function sendHtml(response: Response, status: number, robots: string, html: string) {
  response.status(status);
  response.set('Content-Type', 'text/html; charset=utf-8');
  response.set('X-Robots-Tag', robots);
  response.set('Cache-Control', status === 200
    ? 'public, max-age=300, stale-while-revalidate=3600'
    : 'no-cache, no-store, must-revalidate');
  return response.send(html);
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Cosmetics detail deadline exceeded')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createCosmeticsSeoRouter(dependencies: CosmeticsSeoRouterDependencies): Router {
  const router = Router({ caseSensitive: true, strict: true });
  const origin = canonicalOrigin(dependencies.canonicalOrigin);
  const frontendAssets = dependencies.frontendAssets ?? '';
  const timeoutMs = Math.max(1_000, Math.min(20_000, dependencies.timeoutMs ?? 12_000));

  const handler: RequestHandler = async (request, response) => {
    const kind = String(request.params.kind ?? '') as CosmeticKind;
    const cardId = String(request.params.cardId ?? '');
    if (!KINDS.has(kind) || !CARD_ID_PATTERN.test(cardId)) {
      return sendHtml(response, 404, NOINDEX_ROBOTS, baseDocument({
        title: 'Косметика не найдена | Manacost',
        description: 'Запрошенный объект косметики Hearthstone не найден.',
        robots: NOINDEX_ROBOTS,
        routeStatus: '404',
        body: '<main><h1>Косметика не найдена</h1><p><a href="/cosmetics/">Вернуться в каталог</a></p></main>',
      }));
    }
    try {
      const detail = await withDeadline(dependencies.loadDetail(kind, cardId), timeoutMs);
      if (!detail) {
        return sendHtml(response, 404, NOINDEX_ROBOTS, baseDocument({
          title: 'Косметика не найдена | Manacost',
          description: 'Запрошенный объект косметики Hearthstone не найден.',
          robots: NOINDEX_ROBOTS,
          routeStatus: '404',
          body: '<main><h1>Косметика не найдена</h1><p><a href="/cosmetics/">Вернуться в каталог</a></p></main>',
        }));
      }
      return sendHtml(response, 200, INDEX_ROBOTS, renderDetailDocument({
        kind,
        cardId,
        detail,
        origin,
        frontendAssets,
      }));
    } catch (error) {
      dependencies.onError?.(error);
      response.set('Retry-After', '300');
      return sendHtml(response, 503, NOINDEX_ROBOTS, baseDocument({
        title: 'Библиотека косметики временно недоступна | Manacost',
        description: 'Источник косметики Hearthstone временно недоступен. Попробуйте открыть страницу позже.',
        robots: NOINDEX_ROBOTS,
        routeStatus: '503',
        body: '<main><h1>Библиотека временно недоступна</h1><p>Попробуйте снова через несколько минут.</p></main>',
      }));
    }
  };

  router.get('/cosmetics/:kind/:cardId/', handler);
  return router;
}
