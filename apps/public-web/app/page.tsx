import type { Metadata } from 'next';
import { loadPublicHome } from '@/apps/public-web/lib/publicHome';
import { HomePageClient } from '@/apps/public-web/ui/HomePageClient';
import { type PageSearchParams } from '@/apps/public-web/lib/searchParams';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
const homeMetadata = seoPageMetadata('/', 'HearthPulse — Hearthstone');

/** `/?login` is the account page: its own tab title, noindex from the URL policy. */
export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const metadata = await homeMetadata({ searchParams });
  return 'login' in await searchParams ? { ...metadata, title: 'Личный кабинет — HearthPulse' } : metadata;
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  if ('login' in await searchParams) return <HomePageClient summary={null} articles={[]} login />;
  const { summary, articles } = await loadPublicHome();
  return <>
    <SeoStructuredData path="/" />
    <HomePageClient summary={summary} articles={articles} login={false} />
  </>;
}
