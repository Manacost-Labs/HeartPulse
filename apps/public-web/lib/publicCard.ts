import 'server-only';
import { cache } from 'react';
import type { CardFormat, PublicCardSeed } from '../../../src/modules/constructedCards/public';

import { publicCardSeed } from './publicCardSeed';

/** React cache only deduplicates this anonymous read within a server-render request. */
export const loadPublicCard = cache(async (format: CardFormat, cardId: string): Promise<PublicCardSeed | null> => {
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const url = new URL(`/api/public/constructed-cards/${format}/${encodeURIComponent(cardId)}`, origin);
  const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public card temporarily unavailable');
  return publicCardSeed(await response.json(), cardId);
});
