import type { Metadata } from 'next';
import '../../../../src/route-parchment.css';
import '../../../../src/features/TraditionalModeBanner.css';
import { seoPageForExactPath } from '../../../../src/seo/registry';
import { resolvePublicUrlPolicy } from '../../../../src/shared/seo/publicUrlPolicy';
import { BattlegroundHeroesPageClient } from '../../ui/BattlegroundHeroesPageClient';

const seo = seoPageForExactPath('/heroes');
if (!seo) throw new Error('Missing Battleground heroes SEO contract');

type Search = Promise<Record<string, string | string[] | undefined>>;
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(entry => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  const policy = await resolvePublicUrlPolicy('/heroes', params.toString());
  return {
    title: seo.title, description: seo.description,
    alternates: { canonical: policy.canonicalUrl ?? 'https://hearthpulse.net/heroes/' },
    robots: { index: policy.indexPolicy === 'index', follow: policy.indexPolicy !== 'noindex-nofollow' },
    openGraph: {
      type: 'website', url: 'https://hearthpulse.net/heroes/', siteName: 'HearthPulse', locale: 'ru_RU',
      title: seo.title, description: seo.description,
      images: [{ url: '/assets/og-preview.png', alt: 'HearthPulse — герои Полей сражений', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: seo.title, description: seo.description, images: ['/assets/og-preview.png'] },
  };
}

export default function Page() {
  return <>
    <link rel="preload" href="/wallpaper/profile-hero-hth.webp" as="image" fetchPriority="high" />
    <BattlegroundHeroesPageClient />
  </>;
}
