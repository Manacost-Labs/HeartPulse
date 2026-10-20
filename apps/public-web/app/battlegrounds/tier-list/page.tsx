import '@/src/route-parchment.css';
import { BattlegroundTierListPageClient } from '@/apps/public-web/ui/BattlegroundTierListPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the data loads in the browser, and nginx
// sends query robots as X-Robots-Tag. Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/battlegrounds/tier-list', 'HearthPulse — тир-лист Полей сражений');

export default function Page() {
  return <>
    <SeoStructuredData path="/battlegrounds/tier-list" />
    <BattlegroundTierListPageClient />
  </>;
}
