import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { TierListPageClient } from '@/apps/public-web/ui/TierListPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/tierlist', 'HearthPulse — тир-лист Арены');

export default function Page() {
  return <TierListPageClient />;
}
