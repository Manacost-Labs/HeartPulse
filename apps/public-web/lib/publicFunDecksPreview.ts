import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';
import { publicFunDecksPreview } from './publicFunDecksPreviewData';

/**
 * Guest preview of the fun-deck selection for the server-rendered page, or
 * `null` to let the browser load it. Only the free decks enter the HTML.
 */
export const loadPublicFunDecksPreview = cache(async () => {
  const raw = await readFirstPaintJson(() => fetchPublicExpress('/api/fun-decks'), Date.now() + FIRST_PAINT_READ_BUDGET_MS);
  return raw === null ? null : publicFunDecksPreview(raw);
});
