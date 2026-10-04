import { NextResponse, type NextRequest } from 'next/server';
import { cosmeticsDetailPath } from '@/src/modules/cosmetics/public';
import { constructedCardRoute } from '@/src/modules/constructedCards/public';
import { publicBattlegroundHero } from './lib/publicBattlegroundHeroData';
import { publicBattlegroundLibraryCard } from './lib/publicBattlegroundLibraryCardData';
import { battlegroundLibraryDetailApiPath, type BattlegroundLibraryPool } from './lib/battlegroundLibraryDetailKinds';
import { publicCardSeed } from './lib/publicCardSeed';
import { encodePublicProjection, MISSING_PUBLIC_PROJECTION, PUBLIC_BG_PROJECTION_HEADER,
  PUBLIC_CARD_PROJECTION_HEADER } from './lib/publicProjectionHeader';
import { MISSING_COSMETICS_DETAIL_HEADER } from './lib/cosmeticsDetailContract';
import { fetchPublicExpress } from './lib/expressApi';
import { isPublicHomeDocument, PUBLIC_DOCUMENT_CACHE_CONTROL } from './documentCaching.mjs';

type BattlegroundDetailProbe =
  | { type: 'hero'; dbfId: string; apiPath: string }
  | { type: 'card'; dbfId: string; kindPath: string; pool: BattlegroundLibraryPool; apiPath: string };

function battlegroundDetailProbe(pathname: string): BattlegroundDetailProbe | null {
  const hero = pathname.match(/^\/heroes\/([1-9][0-9]*)\/?$/u);
  if (hero && Number.isSafeInteger(Number(hero[1]))) {
    return { type: 'hero', dbfId: hero[1], apiPath: `/api/bg/heroes/public/${hero[1]}` };
  }
  const card = pathname.match(/^\/library\/(archive\/)?([^/]+)\/[^/]+-([1-9][0-9]*)\/?$/u);
  if (card && pathname.length <= 600 && Number.isSafeInteger(Number(card[3]))) {
    const pool = card[1] ? 'archive' : 'current';
    const apiPath = battlegroundLibraryDetailApiPath(card[2], pool, card[3]);
    if (apiPath) return { type: 'card', dbfId: card[3], kindPath: card[2], pool, apiPath };
  }
  return null;
}

/**
 * `robotsHeader` is false for routes whose Nginx location adds `X-Robots-Tag`
 * to every error status without hiding the upstream header.
 */
function unavailableResponse(retryAfter: string | null, method: string, robotsHeader = true): Response {
  const retry = retryAfter && /^[1-9][0-9]{0,3}$/.test(retryAfter) && Number(retryAfter) <= 3600
    ? retryAfter : '300';
  const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Данные временно недоступны | HearthPulse</title></head><body><main><h1>Данные временно недоступны</h1><p>Попробуйте открыть страницу позже.</p><a href="/">На главную</a></main></body></html>';
  return new Response(method === 'HEAD' ? null : html, { status: 503, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Retry-After': retry,
    ...(robotsHeader ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
  } });
}

async function checkBattlegroundDetail(probe: BattlegroundDetailProbe, headers: Headers, method: string): Promise<Response | null> {
  try {
    const response = await fetchPublicExpress(probe.apiPath);
    if (response.status === 404) {
      headers.set(PUBLIC_BG_PROJECTION_HEADER, MISSING_PUBLIC_PROJECTION);
      return null;
    }
    if (!response.ok) return unavailableResponse(response.headers.get('retry-after'), method);
    const value = await response.json();
    let projection: unknown;
    if (probe.type === 'hero') {
      projection = { hero: publicBattlegroundHero(value, probe.dbfId) };
    } else {
      const card = publicBattlegroundLibraryCard(value, probe.kindPath, probe.dbfId, probe.pool);
      projection = { card: { dbfId: card.dbfId, kind: card.kind, nameRu: card.name,
        typeName: card.typeName, textRu: card.text, images: { card: card.image } },
      canonicalPath: card.canonicalPath };
    }
    const encoded = encodePublicProjection(projection);
    // A large header can exceed an upstream request limit.
    if (!encoded) return unavailableResponse(null, method);
    headers.set(PUBLIC_BG_PROJECTION_HEADER, encoded);
    return null;
  } catch {
    return unavailableResponse(null, method);
  }
}

async function checkCosmeticsDetail(pathname: string, headers: Headers, method: string): Promise<Response | null> {
  const match = pathname.match(/^\/cosmetics\/([^/]+)\/([^/]+)\/?$/u);
  if (!match || !cosmeticsDetailPath(match[1], match[2])) return null;
  try {
    const response = await fetchPublicExpress(`/api/cosmetics/${match[1]}/${match[2]}`);
    await response.body?.cancel();
    if (response.status === 404) {
      headers.set(MISSING_COSMETICS_DETAIL_HEADER, '1');
      return null;
    }
    if (!response.ok) return unavailableResponse(response.headers.get('retry-after'), method);
    return null;
  } catch {
    return unavailableResponse(null, method);
  }
}

/**
 * A missing card stays the page's 404 and a verified card is handed to the
 * page, so one request reads Express once. Only a card the API cannot verify
 * is answered here.
 */
async function checkConstructedCard(format: string, cardId: string, headers: Headers, method: string): Promise<Response | null> {
  try {
    const response = await fetchPublicExpress(`/api/public/constructed-cards/${format}/${encodeURIComponent(cardId)}`);
    if (response.status === 404) {
      headers.set(PUBLIC_CARD_PROJECTION_HEADER, MISSING_PUBLIC_PROJECTION);
      return null;
    }
    if (!response.ok) return unavailableResponse(response.headers.get('retry-after'), method, false);
    const projection = await response.json();
    publicCardSeed(projection, cardId);
    // A projection too large for a header is read again by the page itself.
    const encoded = encodePublicProjection(projection);
    if (encoded) headers.set(PUBLIC_CARD_PROJECTION_HEADER, encoded);
    return null;
  } catch {
    return unavailableResponse(null, method, false);
  }
}

export async function proxy(request: NextRequest) {
  const route = constructedCardRoute(request.nextUrl.pathname);
  const headers = new Headers(request.headers);
  // Ignore client-supplied values; page and metadata receive one URL-derived identity.
  headers.delete('x-hearthpulse-card-id');
  headers.delete('x-hearthpulse-card-format');
  headers.delete(PUBLIC_BG_PROJECTION_HEADER);
  headers.delete(PUBLIC_CARD_PROJECTION_HEADER);
  headers.delete(MISSING_COSMETICS_DETAIL_HEADER);
  if (route.page === 'detail' && route.cardId) {
    headers.set('x-hearthpulse-card-id', route.cardId);
    headers.set('x-hearthpulse-card-format', route.format);
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (route.page === 'detail' && route.cardId) {
      const cardUnavailable = await checkConstructedCard(route.format, route.cardId, headers, request.method);
      if (cardUnavailable) return cardUnavailable;
    }
    const probe = battlegroundDetailProbe(request.nextUrl.pathname);
    if (probe) {
      const unavailable = await checkBattlegroundDetail(probe, headers, request.method);
      if (unavailable) return unavailable;
    }
    const cosmeticsUnavailable = await checkCosmeticsDetail(request.nextUrl.pathname, headers, request.method);
    if (cosmeticsUnavailable) return cosmeticsUnavailable;
    // The other public families get this header from `next.config.mjs`.
    if (isPublicHomeDocument(request.nextUrl.pathname, request.nextUrl.searchParams)) {
      return NextResponse.next({ request: { headers }, headers: { 'Cache-Control': PUBLIC_DOCUMENT_CACHE_CONTROL } });
    }
  }
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ['/', '/standard/cards/:path*', '/heroes/:path*', '/library/:path*', '/cosmetics/:path*'] };
