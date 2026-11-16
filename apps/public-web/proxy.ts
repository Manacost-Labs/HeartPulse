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
import { unavailablePageHtml } from './lib/unavailablePage';
import { fetchPublicExpress } from './lib/expressApi';
import { cachedCatalog } from './lib/defaultCatalogStore';
import { rememberCardProjection, lastGoodCardProjection, forgetCardProjection } from './lib/cardLastGood';
import { CATALOG_READ_DEADLINE_MS } from './lib/publicCatalogCache';
import { probePublicData } from './lib/publicDataProbe';
import { isPublicHomeDocument, PUBLIC_DOCUMENT_CACHE_CONTROL, PUBLIC_DOCUMENT_RESPONSE_HEADERS } from './documentCaching.mjs';

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
 * `indexable` marks the public catalog and card pages: their 503 is transient,
 * so it carries no noindex, neither as a header nor in the HTML (nginx does not
 * add one for 503 either), and the crawler simply returns after `Retry-After`.
 * Other routes keep `X-Robots-Tag: noindex, nofollow`.
 */
function unavailableResponse(retryAfter: string | null, method: string, indexable = false): Response {
  const retry = retryAfter && /^[1-9][0-9]{0,3}$/.test(retryAfter) && Number(retryAfter) <= 3600
    ? retryAfter : '300';
  const html = unavailablePageHtml({ noindex: !indexable });
  return new Response(method === 'HEAD' ? null : html, { status: 503, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Retry-After': retry,
    ...(indexable ? {} : { 'X-Robots-Tag': 'noindex, nofollow' }),
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
 * page, so one request reads Express once, for at most two seconds. A card the
 * API cannot answer is served from its last good projection; without one it is
 * an indexable-safe 503.
 */
async function checkConstructedCard(format: string, cardId: string, headers: Headers, method: string): Promise<Response | null> {
  const fromLastGood = (retryAfter: string | null) => {
    const last = lastGoodCardProjection(format, cardId);
    if (last === undefined) return unavailableResponse(retryAfter, method, true);
    // A projection too large for a header is read by the page from the same last good copy.
    const encoded = encodePublicProjection(last);
    if (encoded) headers.set(PUBLIC_CARD_PROJECTION_HEADER, encoded);
    return null;
  };
  try {
    // The read may outlive its two seconds: it then still warms the last good copy for the next visit.
    const read = fetchPublicExpress(`/api/public/constructed-cards/${format}/${encodeURIComponent(cardId)}`)
      .then(async response => {
        if (response.status === 404) { forgetCardProjection(format, cardId); return { status: 404 as const }; }
        if (!response.ok) { await response.body?.cancel(); return { status: 'error' as const, retryAfter: response.headers.get('retry-after') }; }
        const projection = await response.json();
        publicCardSeed(projection, cardId);
        rememberCardProjection(format, cardId, projection);
        return { status: 200 as const, projection };
      });
    read.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'late'>(resolve => { timer = setTimeout(() => resolve('late'), CATALOG_READ_DEADLINE_MS); });
    const result = await Promise.race([read, late]).finally(() => clearTimeout(timer));
    if (result === 'late') return fromLastGood(null);
    if (result.status === 404) {
      headers.set(PUBLIC_CARD_PROJECTION_HEADER, MISSING_PUBLIC_PROJECTION);
      return null;
    }
    if (result.status === 'error') return fromLastGood(result.retryAfter);
    const encoded = encodePublicProjection(result.projection);
    if (encoded) headers.set(PUBLIC_CARD_PROJECTION_HEADER, encoded);
    return null;
  } catch {
    return fromLastGood(null);
  }
}

const CATALOG_PAGE = /^\/standard\/cards(?:\/(standard|wild))?\/?$/u;

/**
 * The catalog pages read a shared catalog (default, filtered or paged). Probing it here makes an
 * outage visible as a real 503 (a page cannot set a status), while a last good
 * version answers 200 and a failure never reaches the 500 error boundary.
 */
async function checkCatalog(pathname: string, search: string, method: string): Promise<Response | null> {
  const match = pathname.match(CATALOG_PAGE);
  if (!match) return null;
  try {
    await cachedCatalog(match[1] === 'wild' ? 'wild' : 'standard', search.replace(/^\?/, ''));
    return null;
  } catch {
    return unavailableResponse(null, method, true);
  }
}

const PUBLIC_PROFILE_ID = /^[1-9][0-9]{0,9}$/;

/**
 * `/u/<nickname>/` is a sharing alias of the canonical `/id/<n>/`: an existing
 * nickname answers a permanent 301 here, a missing one falls through to the
 * page's 404. Express applies the nickname rules; this only bounds the input.
 * Next turns the same-origin Location into a relative one, so the redirect
 * stays on whatever host served it.
 */
async function redirectPublicNickname(url: NextRequest['nextUrl'], method: string): Promise<Response | null> {
  const match = url.pathname.match(/^\/u\/([^/]{1,200})\/?$/u);
  if (!match) return null;
  let nickname: string;
  try {
    nickname = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  try {
    const response = await fetchPublicExpress(`/api/profiles/by-nickname/${encodeURIComponent(nickname)}`);
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) return unavailableResponse(response.headers.get('retry-after'), method);
    const { publicProfileId } = await response.json() as { publicProfileId?: unknown };
    if (typeof publicProfileId !== 'string' || !PUBLIC_PROFILE_ID.test(publicProfileId)) return unavailableResponse(null, method);
    const target = new URL(`/id/${publicProfileId}/`, url);
    const redirect = NextResponse.redirect(target, 301);
    redirect.headers.set('Cache-Control', 'public, max-age=60');
    return redirect;
  } catch {
    return unavailableResponse(null, method);
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
    // Only a document needs a real status: a client-side (RSC) read or a menu prefetch of the
    // catalog gets the in-app error state, and answering it with 503 only litters the console.
    // Next strips its own RSC markers before the proxy, so a script fetch is told by `Sec-Fetch-Dest: empty`.
    const scriptFetch = request.headers.get('rsc') === '1' || request.headers.get('sec-fetch-dest') === 'empty';
    const catalogUnavailable = scriptFetch ? null : await checkCatalog(request.nextUrl.pathname, request.nextUrl.search, request.method);
    if (catalogUnavailable) return catalogUnavailable;
    const probe = battlegroundDetailProbe(request.nextUrl.pathname);
    if (probe) {
      const unavailable = await checkBattlegroundDetail(probe, headers, request.method);
      if (unavailable) return unavailable;
    }
    const nicknameRedirect = await redirectPublicNickname(request.nextUrl, request.method);
    if (nicknameRedirect) return nicknameRedirect;
    const cosmeticsUnavailable = await checkCosmeticsDetail(request.nextUrl.pathname, headers, request.method);
    if (cosmeticsUnavailable) return cosmeticsUnavailable;
    // A data page is served only with its data (fresh or the last good copy). Without any, the document
    // would be the page without its data, and the regional edge keeps a 200 for everybody: it is a 503 instead.
    const data = scriptFetch || request.nextUrl.searchParams.has('login') ? 'none'
      : await probePublicData(request.nextUrl.pathname, request.nextUrl.searchParams).catch(() => 'unavailable' as const);
    if (data === 'unavailable') return unavailableResponse('60', request.method, true);
    // The other public families get this header from `next.config.mjs`.
    if (isPublicHomeDocument(request.nextUrl.pathname, request.nextUrl.searchParams)) {
      // Without its feeds the home page is still worth showing, but not worth keeping for everybody.
      return NextResponse.next({ request: { headers }, headers: data === 'partial'
        ? { 'Cache-Control': PUBLIC_DOCUMENT_CACHE_CONTROL } : PUBLIC_DOCUMENT_RESPONSE_HEADERS });
    }
  }
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ['/', '/standard/cards/:path*', '/heroes/:path*', '/library/:path*', '/cosmetics/:path*', '/u/:path*',
  '/leaderboards/:path*', '/streamers/:path*', '/standard/patches/:path*', '/standard/archetypes/:path*', '/standard/fun-decks/:path*'] };
