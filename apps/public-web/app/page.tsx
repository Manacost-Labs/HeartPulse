import { loadPublicHome } from '@/apps/public-web/lib/publicHome';
import { HomePageClient } from '@/apps/public-web/ui/HomePageClient';
import { type PageSearchParams } from '@/apps/public-web/lib/searchParams';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/', 'HearthPulse — Hearthstone');

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  if ('login' in await searchParams) return <HomePageClient summary={null} articles={[]} login />;
  const { summary, articles } = await loadPublicHome();
  return <HomePageClient summary={summary} articles={articles} login={false} />;
}
