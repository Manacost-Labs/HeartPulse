import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicClassesTeaser } from '@/apps/public-web/lib/publicClassesTeaser';
import { loadPublicTierlist } from '@/apps/public-web/lib/publicTierlist';
import { ModeHubPage } from '@/apps/public-web/ui/ModeHubPage';
import { arenaHasRows, ArenaNow } from '@/apps/public-web/ui/ModeHubNow';

// The Arena hub: the open class order and tier list, regenerated every five minutes (docs/specs/seo-query-clusters.md).
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/arena', 'HearthPulse — Арена Hearthstone');

export default async function Page() {
  const [classes, tierlist] = await Promise.all([loadPublicClassesTeaser(), loadPublicTierlist()]);
  return <ModeHubPage hub="arena" updatedAt={classes?.updatedAt ?? tierlist?.updatedAt}>
    {arenaHasRows(classes, tierlist) ? <ArenaNow classes={classes} tierlist={tierlist} /> : null}
  </ModeHubPage>;
}
