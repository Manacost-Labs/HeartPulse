import type { Metadata } from 'next';
import { seoPageForExactPath } from '../../../src/seo/registry';
import { resolvePublicUrlPolicy } from '../../../src/shared/seo/publicUrlPolicy';

export type BattlegroundBuilderPath = '/battlegrounds/strategies' | '/battlegrounds/tier-builder';
export type BuilderSearch = Promise<Record<string, string | string[] | undefined>>;

export async function battlegroundBuilderMetadata(pathname: BattlegroundBuilderPath,
  searchParams: BuilderSearch): Promise<Metadata> {
  const seo = seoPageForExactPath(pathname);
  if (!seo) throw new Error(`Missing Battleground builder SEO contract: ${pathname}`);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(entry => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  const policy = await resolvePublicUrlPolicy(pathname, params.toString());
  const canonical = `https://hearthpulse.net${pathname}/`;
  return {
    title: seo.title, description: seo.description,
    alternates: { canonical: policy.canonicalUrl ?? canonical },
    robots: { index: policy.indexPolicy === 'index', follow: policy.indexPolicy !== 'noindex-nofollow' },
    openGraph: {
      type: 'website', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title: seo.title, description: seo.description,
      images: [{ url: '/assets/og-preview.png', alt: seo.title, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: seo.title, description: seo.description,
      images: ['/assets/og-preview.png'] },
  };
}
