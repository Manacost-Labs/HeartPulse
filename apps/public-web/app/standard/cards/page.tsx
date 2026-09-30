import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { CardCatalogPage, type CatalogSearch } from '@/apps/public-web/ui/CardCatalogPage';
export const dynamic = 'force-dynamic';
// The library root is a registry page; the per-format listings describe their format.
export const generateMetadata = seoPageMetadata('/standard/cards', 'HearthPulse — библиотека карт Hearthstone');
export default function Page({ searchParams }: { searchParams: CatalogSearch }) {
  return <CardCatalogPage format="standard" pathname="/standard/cards/" searchParams={searchParams} />;
}
