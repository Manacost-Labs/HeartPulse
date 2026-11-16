import type { Metadata } from 'next';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { PublicDeckBuilderPageClient } from '@/apps/public-web/ui/PublicDeckBuilderPageClient';
import '@/src/modules/deckBuilder/public.css';

const registryMetadata = seoStaticPageMetadata('/standard/deck-builder', 'HearthPulse — конструктор колод');

/**
 * The page stays `noindex, nofollow` (the registry keeps it out of the sitemap), but its canonical
 * is itself: a copy with a `?code=` query points here, and the page never points at another address.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { ...await registryMetadata(), alternates: { canonical: 'https://hearthpulse.net/standard/deck-builder/' } };
}

export default function Page() {
  return <PublicDeckBuilderPageClient />;
}
