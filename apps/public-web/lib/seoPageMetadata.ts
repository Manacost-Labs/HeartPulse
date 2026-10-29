import type { Metadata } from 'next';
import type { SeoDataValues } from '@/src/seo/dataTemplate';
import { seoPageForExactPath, seoPageText } from '@/src/seo/registry';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImagePath, shareImageSectionForPath } from '@/shared/shareImages';
import { type PageSearchParams, searchParamsQuery } from './searchParams';

const SITE_URL = 'https://hearthpulse.net';

function registeredPage(path: string, shareImageAlt: string) {
  const seo = seoPageForExactPath(path);
  if (!seo) throw new Error(`Missing SEO contract for ${path}`);
  if (seo.sitemap && !shareImageAlt) throw new Error(`Missing share image description for ${path}`);
  return seo;
}

/**
 * Values of a registry page's data templates for a request: built from the
 * teaser the page itself loads (a cached loader, so there is no second read),
 * or `null` for the page's static text.
 */
export type SeoDataSource = (query: string) => Promise<SeoDataValues | null>;

async function readDataValues(source: SeoDataSource | undefined, query: string): Promise<SeoDataValues | null> {
  if (!source) return null;
  try {
    return await source(query);
  } catch {
    // The page reads the same data and reports a failure itself; metadata falls back to the static text.
    return null;
  }
}

/**
 * Metadata of a page registered in `config/public-seo-pages.json`: registry
 * title and description, with canonical and robots decided by the public URL
 * policy for `query` (filtered or paginated URLs become noindex) and the share
 * image of the path's section (`shared/shareImages.ts`). Pages the
 * registry keeps out of the sitemap get no canonical or share tags.
 * With `data` the title and description come from the registry's data
 * templates (`seoPageText`).
 */
export async function seoRegistryMetadata(
  path: string, shareImageAlt: string, query = '', data: SeoDataValues | null = null,
): Promise<Metadata> {
  const seo = registeredPage(path, shareImageAlt);
  const policy = await resolvePublicUrlPolicy(seo.pathname, query);
  const { title, description } = seoPageText(seo, data);
  const metadata: Metadata = { title, description, robots: policy.robots };
  if (!seo.sitemap) return metadata;
  const pageUrl = `${SITE_URL}${seo.pathname === '/' ? '/' : `${seo.pathname}/`}`;
  const shareImage = shareImagePath(shareImageSectionForPath(seo.pathname));
  return {
    ...metadata,
    alternates: { canonical: policy.canonicalUrl ?? pageUrl },
    openGraph: {
      type: 'website', url: pageUrl, siteName: 'HearthPulse', locale: 'ru_RU',
      title, description,
      images: [{ url: shareImage, alt: shareImageAlt, width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }],
    },
    twitter: {
      card: 'summary_large_image', title, description, images: [shareImage],
    },
  };
}

/**
 * `generateMetadata` of a registry page whose canonical and robots depend on
 * the request query. `data` names the page's live values (see `SeoDataSource`).
 */
export function seoPageMetadata(path: string, shareImageAlt: string, data?: SeoDataSource) {
  registeredPage(path, shareImageAlt);
  return async function generateMetadata(
    { searchParams }: { searchParams: PageSearchParams },
  ): Promise<Metadata> {
    const query = searchParamsQuery(await searchParams);
    return seoRegistryMetadata(path, shareImageAlt, query, await readDataValues(data, query));
  };
}

/**
 * `generateMetadata` of a registry page that ignores the query string. It
 * reads no request data, so a page without other dynamic inputs stays
 * prerendered. `shareImageAlt` is required for pages listed in the sitemap.
 * `data` names the page's live values; its loader must be a prerender-safe
 * read (the page's `revalidate` loader).
 */
export function seoStaticPageMetadata(path: string, shareImageAlt = '', data?: SeoDataSource) {
  registeredPage(path, shareImageAlt);
  return async function generateMetadata(): Promise<Metadata> {
    return seoRegistryMetadata(path, shareImageAlt, '', await readDataValues(data, ''));
  };
}
