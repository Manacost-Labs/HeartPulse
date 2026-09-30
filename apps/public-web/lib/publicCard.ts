import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import type { CardFormat, PublicCardSeed } from '@/src/modules/constructedCards/public';

import { publicCardSeed } from './publicCardSeed';
import { fetchPublicExpress } from './expressApi';
import { decodePublicProjection, MISSING_PUBLIC_PROJECTION, PUBLIC_CARD_PROJECTION_HEADER } from './publicProjectionHeader';

/**
 * The anonymous card projection. Proxy has already read it for this request
 * and hands it over in a header; Express is asked only when it could not.
 * React cache deduplicates the read between metadata and the page.
 */
export const loadPublicCard = cache(async (format: CardFormat, cardId: string): Promise<PublicCardSeed | null> => {
  const projection = (await headers()).get(PUBLIC_CARD_PROJECTION_HEADER);
  if (projection === MISSING_PUBLIC_PROJECTION) return null;
  if (projection) return publicCardSeed(decodePublicProjection(projection), cardId);
  const response = await fetchPublicExpress(`/api/public/constructed-cards/${format}/${encodeURIComponent(cardId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public card temporarily unavailable');
  return publicCardSeed(await response.json(), cardId);
});
