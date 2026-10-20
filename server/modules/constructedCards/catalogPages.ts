import { ConstructedCardUpstreamError, type ConstructedCardFormat } from './serviceContracts.js';

type CatalogPageSource<Page> = {
  catalogBaseUrl: string;
  fetchJson: (url: string) => Promise<Page>;
};

function isTransientCatalogPageError(error: unknown): boolean {
  if (!(error instanceof ConstructedCardUpstreamError)) return false;
  return error.status === null || error.status === 429 || error.status >= 500;
}

/**
 * Reads one collectible catalog page. While a Kolodahs sync rewrites the
 * catalog tables, single uncached pages take 5-8 s and occasionally cross the
 * per-request timeout. One retry keeps that spike from discarding an otherwise
 * complete refresh; a page that fails twice still demotes the catalog to LKG.
 */
export async function fetchConstructedCatalogPage<Page>(
  source: CatalogPageSource<Page>,
  format: ConstructedCardFormat,
  page: number,
): Promise<Page> {
  const url = new URL(`${source.catalogBaseUrl.replace(/\/$/, '')}/constructed-cards`);
  url.searchParams.set('format', format);
  url.searchParams.set('collectible', '1');
  url.searchParams.set('per_page', '200');
  url.searchParams.set('page', String(page));
  try {
    return await source.fetchJson(url.toString());
  } catch (error) {
    if (!isTransientCatalogPageError(error)) throw error;
    return source.fetchJson(url.toString());
  }
}
