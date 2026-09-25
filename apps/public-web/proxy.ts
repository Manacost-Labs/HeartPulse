import { NextResponse, type NextRequest } from 'next/server';
import { constructedCardRoute } from '../../src/modules/constructedCards/public';
import { publicBattlegroundHero } from './lib/publicBattlegroundHeroData';
import { publicBattlegroundLibraryCard } from './lib/publicBattlegroundLibraryCardData';
import { encodePublicBattlegroundProjection, MISSING_PUBLIC_BG_PROJECTION,
  PUBLIC_BG_PROJECTION_HEADER } from './lib/publicBattlegroundProjectionHeader';

type BattlegroundDetailProbe =
  | { type: 'hero'; dbfId: string; apiPath: string }
  | { type: 'card'; dbfId: string; kindPath: 'minions' | 'spells'; apiPath: string };

function battlegroundDetailProbe(pathname: string): BattlegroundDetailProbe | null {
  const hero = pathname.match(/^\/heroes\/([1-9][0-9]*)\/?$/u);
  if (hero && Number.isSafeInteger(Number(hero[1]))) {
    return { type: 'hero', dbfId: hero[1], apiPath: `/api/bg/heroes/public/${hero[1]}` };
  }
  const card = pathname.match(/^\/library\/(minions|spells)\/[^/]+-([1-9][0-9]*)\/?$/u);
  if (card && pathname.length <= 600 && Number.isSafeInteger(Number(card[2]))) {
    const kindPath = card[1] as 'minions' | 'spells';
    return { type: 'card', dbfId: card[2], kindPath,
      apiPath: `/api/bg/library/public/${kindPath === 'minions' ? 'minion' : 'spell'}/${card[2]}` };
  }
  return null;
}

function unavailableResponse(retryAfter: string | null, method: string): Response {
  const retry = retryAfter && /^[1-9][0-9]{0,3}$/.test(retryAfter) && Number(retryAfter) <= 3600
    ? retryAfter : '300';
  const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Данные временно недоступны | HearthPulse</title></head><body><main><h1>Данные временно недоступны</h1><p>Попробуйте открыть страницу позже.</p><a href="/">На главную</a></main></body></html>';
  return new Response(method === 'HEAD' ? null : html, { status: 503, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Retry-After': retry,
    'X-Robots-Tag': 'noindex, nofollow',
  } });
}

async function checkBattlegroundDetail(probe: BattlegroundDetailProbe, headers: Headers, method: string): Promise<Response | null> {
  try {
    const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
      throw new Error('Invalid legacy origin');
    }
    const response = await fetch(new URL(probe.apiPath, origin), {
      cache: 'no-store', credentials: 'omit', redirect: 'error',
      signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
    });
    if (response.status === 404) {
      headers.set(PUBLIC_BG_PROJECTION_HEADER, MISSING_PUBLIC_BG_PROJECTION);
      return null;
    }
    if (!response.ok) return unavailableResponse(response.headers.get('retry-after'), method);
    const value = await response.json();
    let projection: unknown;
    if (probe.type === 'hero') {
      projection = { hero: publicBattlegroundHero(value, probe.dbfId) };
    } else {
      const card = publicBattlegroundLibraryCard(value, probe.kindPath, probe.dbfId);
      projection = { card: { dbfId: card.dbfId, kind: card.kind, nameRu: card.name,
        typeName: card.typeName, textRu: card.text, images: { card: card.image } },
      canonicalPath: card.canonicalPath };
    }
    const encoded = encodePublicBattlegroundProjection(projection);
    if (!encoded) return unavailableResponse(null, method);
    headers.set(PUBLIC_BG_PROJECTION_HEADER, encoded);
    return null;
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
  if (route.page === 'detail' && route.cardId) {
    headers.set('x-hearthpulse-card-id', route.cardId);
    headers.set('x-hearthpulse-card-format', route.format);
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    const probe = battlegroundDetailProbe(request.nextUrl.pathname);
    if (probe) {
      const unavailable = await checkBattlegroundDetail(probe, headers, request.method);
      if (unavailable) return unavailable;
    }
  }
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ['/standard/cards/:path*', '/heroes/:path*', '/library/:path*'] };
