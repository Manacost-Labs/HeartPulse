import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { FunDecksPageClient } from '@/apps/public-web/ui/FunDecksPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/fun-decks', 'HearthPulse — фан-колоды');

export default function Page() {
  return <FunDecksPageClient />;
}
