import { seoPageForExactPath } from '@/src/seo/registry';
import type { Metadata } from 'next';
import { loadPublicGallery } from '@/apps/public-web/lib/publicGallery';
import { GalleryPageClient } from '@/apps/public-web/ui/GalleryPageClient';
import { INDEXABLE_ROBOTS } from '@/src/shared/seo/robots';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImagePath } from '@/shared/shareImages';
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
    images: [{ url: shareImagePath(), alt: 'HearthPulse — статистика и тир-листы Hearthstone', width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }],
  },
  twitter: {
    card: 'summary_large_image', title: seo.title,
    description: seo.description, images: [shareImagePath()],
  },
};

export default async function Page() {
  return <>
    <SeoStructuredData path="/gallery" />
    <GalleryPageClient data={await loadPublicGallery()} />
  </>;
}
