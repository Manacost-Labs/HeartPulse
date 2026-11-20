import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { loadWithLastGood } from './pageLastGood';
import { parseStandardMetaSeed, standardMetaPublicPath } from './publicStandardMetaTeaserData';
import type { StandardMetaFormat } from '@/shared/standardMetaContract';

/**
 * The open general slice of Standard for the prerendered guest view, or `null` to let the browser load it
 * (the build without an API, or a source that is down with no earlier slice). A source that answers nothing
 * the page accepts is replaced by the last slice that was accepted (`pageLastGood`): after a restart the
 * page cache holds only the build's empty copy, and a regeneration must not publish it again.
 */
export const loadPublicStandardMetaTeaser = cache(async (format: StandardMetaFormat = 'standard') => {
  const deadline = Date.now() + PRERENDERED_DATA_READ_BUDGET_MS;
  return loadWithLastGood(`standard-meta-${format}`, () => readFirstPaintJson(
    signal => fetchPublicExpress(standardMetaPublicPath(format), signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS, freshOnly: true }), deadline),
  raw => parseStandardMetaSeed(raw, format));
});

/**
 * The slice a prerendered meta page renders. It never throws: a regeneration without a source renders the last
 * good slice, and only when there is none (the build, a first start) the page prints the stub that the warm-up
 * after a deploy replaces. A thrown error is a 500 for the visitor whose request waits for the regeneration.
 */
export const loadPublicStandardMetaPageTeaser = loadPublicStandardMetaTeaser;
