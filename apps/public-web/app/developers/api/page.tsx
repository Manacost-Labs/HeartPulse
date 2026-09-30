import type { Metadata } from 'next';
import { seoPageForExactPath } from '@/src/seo/registry';
import { DeveloperApiPageClient } from '@/apps/public-web/ui/DeveloperApiPageClient';
import { INDEXABLE_ROBOTS } from '@/src/shared/seo/robots';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

const seo = seoPageForExactPath('/developers/api');
if (!seo) throw new Error('Missing developer API SEO contract');

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  alternates: { canonical: 'https://hearthpulse.net/developers/api/' },
  robots: INDEXABLE_ROBOTS,
};

export default function Page() {
  return <>
    <SeoStructuredData path="/developers/api" />
    <DeveloperApiPageClient />
  </>;
}
