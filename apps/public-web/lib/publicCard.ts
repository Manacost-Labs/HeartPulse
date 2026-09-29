import 'server-only';
import { cache } from 'react';
import type { CardFormat, PublicCardSeed } from '@/src/modules/constructedCards/public';

import { publicCardSeed } from './publicCardSeed';
import { fetchPublicExpress } from './expressApi';

/** React cache only deduplicates this anonymous read within a server-render request. */
export const loadPublicCard = cache(async (format: CardFormat, cardId: string): Promise<PublicCardSeed | null> => {
  const response = await fetchPublicExpress(`/api/public/constructed-cards/${format}/${encodeURIComponent(cardId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public card temporarily unavailable');
  return publicCardSeed(await response.json(), cardId);
});
