import type { Metadata } from 'next';
import { seoPageForExactPath } from '@/src/seo/registry';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { type PageSearchParams, searchParamsQuery } from './searchParams';

const SITE_URL = 'https://hearthpulse.net';
const SHARE_IMAGE = '/assets/og-preview.png';

function registeredPage(path: string, shareImageAlt: string) {
  const seo = seoPageForExactPath(path);
  if (!seo) throw new Error(`Missing SEO contract for ${path}`);
  if (seo.sitemap && !shareImageAlt) throw new Error(`Missing share image description for ${path}`);
  return seo;
}

/**
 * Metadata of a page registered in `config/public-seo-pages.json`: registry
 * title and description, with canonical and robots decided by the public URL
 * policy for `query` (filtered or paginated URLs become noindex). Pages the
 * registry keeps out of the sitemap get no canonical or share tags.
 */
export async function seoRegistryMetadata(path: string, shareImageAlt: string, query = ''): Promise<Metadata> {
  const seo = registeredPage(path, shareImageAlt);
  const policy = await resolvePublicUrlPolicy(seo.pathname, query);
  const metadata: Metadata = { title: seo.title, description: seo.description, robots: policy.robots };
  if (!seo.sitemap) return metadata;
  const pageUrl = `${SITE_URL}${seo.pathname === '/' ? '/' : `${seo.pathname}/`}`;
  return {
    ...metadata,
    alternates: { canonical: policy.canonicalUrl ?? pageUrl },
    openGraph: {
      type: 'website', url: pageUrl, siteName: 'HearthPulse', locale: 'ru_RU',
      title: seo.title, description: seo.description,
      images: [{ url: SHARE_IMAGE, alt: shareImageAlt, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image', title: seo.title, description: seo.description, images: [SHARE_IMAGE],
    },
  };
}

/** `generateMetadata` of a registry page whose canonical and robots depend on the request query. */
export function seoPageMetadata(path: string, shareImageAlt: string) {
  registeredPage(path, shareImageAlt);
  return async function generateMetadata(
    { searchParams }: { searchParams: PageSearchParams },
  ): Promise<Metadata> {
    return seoRegistryMetadata(path, shareImageAlt, searchParamsQuery(await searchParams));
  };
}

/**
 * `generateMetadata` of a registry page that ignores the query string. It
 * reads no request data, so a page without other dynamic inputs stays
 * prerendered. `shareImageAlt` is required for pages listed in the sitemap.
 */
export function seoStaticPageMetadata(path: string, shareImageAlt = '') {
  registeredPage(path, shareImageAlt);
  return function generateMetadata(): Promise<Metadata> {
    return seoRegistryMetadata(path, shareImageAlt);
  };
}
