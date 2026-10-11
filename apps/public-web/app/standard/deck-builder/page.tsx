import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { PublicDeckBuilderPageClient } from '@/apps/public-web/ui/PublicDeckBuilderPageClient';
import '@/src/modules/deckBuilder/public.css';

export const generateMetadata = seoStaticPageMetadata('/standard/deck-builder', 'HearthPulse — конструктор колод');

export default function Page() {
  return <PublicDeckBuilderPageClient />;
}
