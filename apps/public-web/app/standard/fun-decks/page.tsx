import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { FunDecksPageClient } from '@/apps/public-web/ui/FunDecksPageClient';
import { loadPublicFunDecksPreview } from '@/apps/public-web/lib/publicFunDecksPreview';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/fun-decks', 'HearthPulse — фан-колоды');

export default async function Page() {
  return <>
    <SeoStructuredData path="/standard/fun-decks" />
    <FunDecksPageClient initialPreview={await loadPublicFunDecksPreview()} />
  </>;
}
