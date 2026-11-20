import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { GUIDES_LIST_PATH, parsePublicGuidesList } from './publicGuidesListData';

/** The first page of the open guide list for the prerendered archive, or `null` (the browser then asks for it). */
export const loadPublicGuidesList = cache(async () => parsePublicGuidesList(await readFirstPaintJson(
  signal => fetchPublicExpress(GUIDES_LIST_PATH, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
  Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
)));
