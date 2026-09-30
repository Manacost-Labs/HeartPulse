import { seoPageForExactPath } from '@/src/seo/registry';
import type { Metadata } from 'next';
import { loadPublicGallery } from '@/apps/public-web/lib/publicGallery';
import { GalleryPageClient } from '@/apps/public-web/ui/GalleryPageClient';
import { INDEXABLE_ROBOTS } from '@/src/shared/seo/robots';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

const seo = seoPageForExactPath('/gallery');
if (!seo) throw new Error('Missing gallery SEO contract');

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  alternates: { canonical: 'https://hearthpulse.net/gallery/' },
  robots: INDEXABLE_ROBOTS,
  openGraph: {
    type: 'website', url: 'https://hearthpulse.net/gallery/',
    siteName: 'HearthPulse', locale: 'ru_RU',
    title: seo.title, description: seo.description,
    images: [{ url: '/assets/og-preview.png', alt: 'HearthPulse — статистика и тир-листы Hearthstone', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image', title: seo.title,
    description: seo.description, images: ['/assets/og-preview.png'],
  },
};

export default async function Page() {
  return <>
    <SeoStructuredData path="/gallery" />
    <GalleryPageClient data={await loadPublicGallery()} />
  </>;
}
