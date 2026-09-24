import { seoPageForExactPath } from '../../../../src/seo/registry';
import type { Metadata } from 'next';
import { loadPublicGallery } from '../../lib/publicGallery';
import { GalleryPageClient } from '../../ui/GalleryPageClient';

const seo = seoPageForExactPath('/gallery');
if (!seo) throw new Error('Missing gallery SEO contract');

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  alternates: { canonical: 'https://hearthpulse.net/gallery/' },
  robots: {
    index: true, follow: true,
    'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1,
  },
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
  return <GalleryPageClient data={await loadPublicGallery()} />;
}
