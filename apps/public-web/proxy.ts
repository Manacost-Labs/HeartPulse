import { NextResponse, type NextRequest } from 'next/server';
import { constructedCardRoute } from '../../src/modules/constructedCards/public';

export function proxy(request: NextRequest) {
  const route = constructedCardRoute(request.nextUrl.pathname);
  const headers = new Headers(request.headers);
  // Ignore client-supplied values; page and metadata receive one URL-derived identity.
  headers.delete('x-hearthpulse-card-id');
  headers.delete('x-hearthpulse-card-format');
  if (route.page === 'detail' && route.cardId) {
    headers.set('x-hearthpulse-card-id', route.cardId);
    headers.set('x-hearthpulse-card-format', route.format);
  }
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: '/standard/cards/:path*' };
