import rawRegistry from '../../config/public-seo-pages.json';
import { assertSeoDataTemplate } from './dataTemplate';

/**
 * Tokens the data templates (`dataTitle`, `dataDescription`) may use; the
 * values come from the page's own anonymous teaser (apps/public-web/lib/seoDataValues.ts).
 * - `month`: «октябрь 2026», the month of the data (absent when the data is older than a week)
 * - `asOf`: « на 29 октября 2026» or «, обновлено 20 октября 2026» with its own leading separator
 * - `leader`: the leading archetype of the meta with its winrate
 * - `archetypes`: «193 архетипа»
 * - `format`: the catalog's format in the genitive case, «Стандарта»
 */
export const SEO_DATA_TOKENS = ['month', 'asOf', 'leader', 'archetypes', 'format'] as const;

export type PublicSeoPage = {
  pathname: string;
  policyRouteId: string;
  navigationRouteId?: string;
  /** Static title: the fallback of a page without data. Only `{year}` is allowed. */
  title: string;
  /** Static description: the fallback of a page without data. Only `{year}` is allowed. */
  description: string;
  /** Title with live data (`SEO_DATA_TOKENS`), used while the page has fresh data. Unrendered template. */
  dataTitle?: string;
  /** Description with live data (`SEO_DATA_TOKENS`). Unrendered template. */
  dataDescription?: string;
  sitemap: boolean;
};

type RawSeoPage = Omit<PublicSeoPage, 'pathname'>;
type RawSeoRegistry = {
  schemaVersion: number;
  pages: Record<string, RawSeoPage>;
};

const PATH_PATTERN = /^\/(?:[^/?#]+(?:\/[^/?#]+)*)?$/;
const TEMPLATE_PATTERN = /\{([a-z]+)\}/g;

export function renderSeoTemplate(value: string, year = new Date().getUTCFullYear()): string {
  return value.replace(TEMPLATE_PATTERN, (_match, token: string) => {
    if (token === 'year') return String(year);
    throw new Error(`Unsupported SEO template token: {${token}}`);
  });
}

function normalizeLookupPath(pathname: string): string {
  const withoutQuery = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const absolute = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return absolute.replace(/\/+$/, '') || '/';
}

function validateRegistry(value: unknown): readonly PublicSeoPage[] {
  const registry = value as Partial<RawSeoRegistry>;
  if (registry.schemaVersion !== 1 || !registry.pages || typeof registry.pages !== 'object') {
    throw new Error('Unsupported public SEO page registry');
  }

  const navigationRouteIds = new Set<string>();
  return Object.entries(registry.pages).map(([pathname, page]) => {
    if (!PATH_PATTERN.test(pathname) || normalizeLookupPath(pathname) !== pathname) {
      throw new Error(`Invalid SEO registry pathname: ${pathname}`);
    }
    if (!page || typeof page !== 'object'
      || typeof page.policyRouteId !== 'string' || !page.policyRouteId.trim()
      || typeof page.title !== 'string' || page.title.trim().length < 10
      || typeof page.description !== 'string' || page.description.trim().length < 40
      || typeof page.sitemap !== 'boolean') {
      throw new Error(`Invalid SEO registry page: ${pathname}`);
    }
    if ((page.dataTitle === undefined) !== (page.dataDescription === undefined)) {
      throw new Error(`SEO registry page needs both dataTitle and dataDescription: ${pathname}`);
    }
    if (page.dataTitle !== undefined) {
      if (typeof page.dataTitle !== 'string' || typeof page.dataDescription !== 'string') {
        throw new Error(`Invalid SEO data templates: ${pathname}`);
      }
      assertSeoDataTemplate(page.dataTitle, SEO_DATA_TOKENS, `${pathname} dataTitle`);
      assertSeoDataTemplate(page.dataDescription, SEO_DATA_TOKENS, `${pathname} dataDescription`);
    }
    if (page.navigationRouteId !== undefined) {
      if (typeof page.navigationRouteId !== 'string' || !page.navigationRouteId.trim()) {
        throw new Error(`Invalid navigation route id for SEO page: ${pathname}`);
      }
      if (navigationRouteIds.has(page.navigationRouteId)) {
        throw new Error(`Duplicate SEO navigation route id: ${page.navigationRouteId}`);
      }
      navigationRouteIds.add(page.navigationRouteId);
    }

    return Object.freeze({
      pathname,
      policyRouteId: page.policyRouteId,
      ...(page.navigationRouteId ? { navigationRouteId: page.navigationRouteId } : {}),
      title: renderSeoTemplate(page.title.trim()),
      description: renderSeoTemplate(page.description.trim()),
      ...(page.dataTitle ? { dataTitle: page.dataTitle.trim(), dataDescription: page.dataDescription?.trim() } : {}),
      sitemap: page.sitemap,
    });
  });
}

const pages = Object.freeze(validateRegistry(rawRegistry));
const pagesByPath = new Map(pages.map(page => [page.pathname, page]));
const pagesByNavigationRoute = new Map(
  pages.filter(page => page.navigationRouteId).map(page => [page.navigationRouteId, page]),
);

export function publicSeoPages(): readonly PublicSeoPage[] {
  return pages;
}

export function seoPageForExactPath(pathname: string): PublicSeoPage | null {
  return pagesByPath.get(normalizeLookupPath(pathname)) ?? null;
}

export function seoPageForNavigationRoute(routeId: string): PublicSeoPage {
  const page = pagesByNavigationRoute.get(routeId);
  if (!page) throw new Error(`Missing SEO metadata for navigation route: ${routeId}`);
  return page;
}
