import '@/src/route-parchment.css';
import '@/src/shared/ui/LoadingSurface.css';
import '@/src/features/TraditionalModeBanner.css';
import { ViciousGoldPageClient } from '@/apps/public-web/ui/ViciousGoldPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/vicious-gold', 'HearthPulse — Vicious Syndicate Gold');

export default function Page() {
  return <ViciousGoldPageClient />;
}
