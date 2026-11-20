import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPrerenderedWildArchetypeCatalog } from '@/apps/public-web/lib/publicWildArchetypeCatalog';
import { ModeHubPage } from '@/apps/public-web/ui/ModeHubPage';
import { WildNow } from '@/apps/public-web/ui/ModeHubNow';

// The Wild hub: the most played archetypes of the open Wild catalog, regenerated every five minutes
// (docs/specs/seo-query-clusters.md).
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/wild', 'HearthPulse — Вольный формат Hearthstone');

export default async function Page() {
  const catalog = await loadPrerenderedWildArchetypeCatalog();
  return <ModeHubPage hub="wild" updatedAt={catalog?.updatedAt}>
    {catalog && catalog.items.length ? <WildNow catalog={catalog} /> : null}
  </ModeHubPage>;
}
