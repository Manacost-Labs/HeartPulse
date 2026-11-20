import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { loadWithLastGood } from './pageLastGood';
import { parseStandardMetaSeed, standardMetaPublicPath } from './publicStandardMetaTeaserData';
import type { StandardMetaFormat } from '@/shared/standardMetaContract';

const readSlice = (format: StandardMetaFormat) => {
  const deadline = Date.now() + PRERENDERED_DATA_READ_BUDGET_MS;
  return readFirstPaintJson(
    signal => fetchPublicExpress(standardMetaPublicPath(format), signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS, freshOnly: true }), deadline);
};

/**
 * The open general slice of Standard for the prerendered guest view, or `null` to let the browser load it
 * (the build without an API, or an upstream failure). The mode hub uses this one: without data it drops its block.
 */
export const loadPublicStandardMetaTeaser = cache(async (format: StandardMetaFormat = 'standard') =>
  parseStandardMetaSeed(await readSlice(format), format));

/**
 * The slice a prerendered meta page renders (and prints in its metadata). A source that answers nothing the
 * page accepts is replaced by the last slice that was accepted (`pageLastGood`): after a restart the page cache
 * holds only the build's empty copy, and a regeneration must not publish it again, nor throw, which a visitor
 * whose request waits for the regeneration would get as a 500. `null` only with neither source nor copy (the
 * build, a first start): the page prints the stub that the warm-up after a deploy replaces.
 */
export const loadPublicStandardMetaPageTeaser = cache(async (format: StandardMetaFormat = 'standard') =>
  loadWithLastGood(`standard-meta-${format}`, () => readSlice(format), raw => parseStandardMetaSeed(raw, format)));
