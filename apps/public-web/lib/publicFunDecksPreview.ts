import 'server-only';
import { cache } from 'react';
import { readPublicJsonOrNull } from './firstPaintStore';
import { FUN_DECKS_PATH } from './publicDataPaths';
import { publicFunDecksPreview } from './publicFunDecksPreviewData';

/**
 * Guest preview of the fun-deck selection for the server-rendered page, or
 * `null` to let the browser load it. Only the free decks enter the HTML.
 */
export const loadPublicFunDecksPreview = cache(async () => {
  const raw = await readPublicJsonOrNull(FUN_DECKS_PATH);
  return raw === null ? null : publicFunDecksPreview(raw);
});
