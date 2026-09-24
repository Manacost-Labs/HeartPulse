import type { Metadata } from 'next';
import { seoPageForExactPath } from '../../../../../src/seo/registry';
import { DeveloperApiPageClient } from '../../../ui/DeveloperApiPageClient';

const seo = seoPageForExactPath('/developers/api');
if (!seo) throw new Error('Missing developer API SEO contract');

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  alternates: { canonical: 'https://hearthpulse.net/developers/api/' },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <DeveloperApiPageClient />;
}
