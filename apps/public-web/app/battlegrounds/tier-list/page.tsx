import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { BattlegroundTierListPageClient } from '@/apps/public-web/ui/BattlegroundTierListPageClient';
import { printedOpenBuilds } from '@/apps/public-web/lib/publicBattlegroundBuildsData';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { battlegroundBuildsSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { loadPublicBattlegroundBuilds } from '@/apps/public-web/lib/publicBattlegroundBuilds';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the open builds (HSReplay compositions by tier, with key minions, an
// example board and the base-range average place) are read here from Express's anonymous projection and shown
// in the subscriber's tier list; the minion, spell and trinket lists load in the browser for subscribers only.
// nginx sends query robots as X-Robots-Tag. Regeneration picks up runtime switches; a failed read keeps
// the last good copy instead of an empty page.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/battlegrounds/tier-list', 'HearthPulse — тир-лист Полей сражений',
  async () => battlegroundBuildsSeoValues(await loadPublicBattlegroundBuilds('compositions'), Date.now()));

export default async function Page() {
  const data = await loadPublicBattlegroundBuilds('compositions');
  return <>
    <SeoStructuredData path="/battlegrounds/tier-list" data={data}
      items={data ? printedOpenBuilds(data).map(build => ({ name: build.title, url: `https://hearthpulse.net/battlegrounds/tier-list/#build-${build.key}` })) : undefined} />
    <BattlegroundTierListPageClient compositions={data} />
  </>;
}
