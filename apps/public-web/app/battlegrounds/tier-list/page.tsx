import '@/src/route-parchment.css';
import { BattlegroundTierListPageClient } from '@/apps/public-web/ui/BattlegroundTierListPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/battlegrounds/tier-list', 'HearthPulse — тир-лист Полей сражений');

export default function Page() {
  return <>
    <SeoStructuredData path="/battlegrounds/tier-list" />
    <BattlegroundTierListPageClient />
  </>;
}
