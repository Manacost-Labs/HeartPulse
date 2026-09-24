import type { Metadata } from 'next';
import { seoPageForExactPath } from '../../../src/seo/registry';
import { resolvePublicUrlPolicy } from '../../../src/shared/seo/publicUrlPolicy';
import { loadPublicHome } from '../lib/publicHome';
import { HomePageClient } from '../ui/HomePageClient';

const seo = seoPageForExactPath('/');
if (!seo) throw new Error('Missing home SEO contract');

type Search = Promise<Record<string, string | string[] | undefined>>;
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(entry => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  const policy = await resolvePublicUrlPolicy('/', params.toString());
  return {
    title: seo.title, description: seo.description,
    alternates: { canonical: policy.canonicalUrl ?? 'https://hearthpulse.net/' },
    robots: { index: policy.indexPolicy === 'index', follow: policy.indexPolicy !== 'noindex-nofollow' },
    openGraph: {
      type: 'website', url: 'https://hearthpulse.net/', siteName: 'HearthPulse', locale: 'ru_RU',
      title: seo.title, description: seo.description,
      images: [{ url: '/assets/og-preview.png', alt: 'HearthPulse — Hearthstone', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: seo.title, description: seo.description, images: ['/assets/og-preview.png'] },
  };
}

export default async function Page({ searchParams }: { searchParams: Search }) {
  if ('login' in await searchParams) return <HomePageClient summary={null} articles={[]} login />;
  const { summary, articles } = await loadPublicHome();
  return <HomePageClient summary={summary} articles={articles} login={false} />;
}
