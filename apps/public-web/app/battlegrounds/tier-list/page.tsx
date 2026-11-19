import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { BattlegroundTierListPageClient } from '@/apps/public-web/ui/BattlegroundTierListPageClient';
import { BattlegroundBuildsPublicList, buildAnchor } from '@/apps/public-web/ui/BattlegroundBuildsPublicList';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicBattlegroundBuilds } from '@/apps/public-web/lib/publicBattlegroundBuilds';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the open builds (HSReplay compositions by tier, with key minions,
// conditions, an example board and the base-range average place) are read here from Express's anonymous
// projection, the narrow ranges, fork analysis and trinkets load in the browser for subscribers only.
// nginx sends query robots as X-Robots-Tag. Regeneration picks up runtime switches; a failed read keeps
// the last good copy instead of an empty page.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/battlegrounds/tier-list', 'HearthPulse — тир-лист Полей сражений');

export default async function Page() {
  const data = await loadPublicBattlegroundBuilds('compositions');
  return <>
    <SeoStructuredData path="/battlegrounds/tier-list" data={data}
      items={data?.builds.map(build => ({ name: build.title, url: `https://hearthpulse.net/battlegrounds/tier-list/#${buildAnchor(build)}` }))} />
    <BattlegroundTierListPageClient builds={<BattlegroundBuildsPublicList data={data} />} />
  </>;
}
