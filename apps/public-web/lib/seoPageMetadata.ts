import type { Metadata } from 'next';
import { seoPageForExactPath } from '@/src/seo/registry';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';

/** App Router `searchParams` of a page segment. */
export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

const SITE_URL = 'https://hearthpulse.net';
const SHARE_IMAGE = '/assets/og-preview.png';

/** Serializes App Router search params in request order for the public URL policy. */
export function searchParamsQuery(values: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach(entry => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  return params.toString();
}

/**
 * Builds `generateMetadata` for a page registered in
 * `config/public-seo-pages.json`: registry title and description, share
 * cards, and canonical and robots decided by the public URL policy for the
 * request query (filtered or paginated URLs become noindex).
 */
export function seoPageMetadata(path: string, shareImageAlt: string) {
  const seo = seoPageForExactPath(path);
  if (!seo) throw new Error(`Missing SEO contract for ${path}`);
  const pageUrl = `${SITE_URL}${path === '/' ? '/' : `${path}/`}`;

  return async function generateMetadata(
    { searchParams }: { searchParams: PageSearchParams },
  ): Promise<Metadata> {
    const policy = await resolvePublicUrlPolicy(path, searchParamsQuery(await searchParams));
    return {
      title: seo.title, description: seo.description,
      alternates: { canonical: policy.canonicalUrl ?? pageUrl },
      robots: { index: policy.indexPolicy === 'index', follow: policy.indexPolicy !== 'noindex-nofollow' },
      openGraph: {
        type: 'website', url: pageUrl, siteName: 'HearthPulse', locale: 'ru_RU',
        title: seo.title, description: seo.description,
        images: [{ url: SHARE_IMAGE, alt: shareImageAlt, width: 1200, height: 630 }],
      },
      twitter: {
        card: 'summary_large_image', title: seo.title, description: seo.description, images: [SHARE_IMAGE],
      },
    };
  };
}
