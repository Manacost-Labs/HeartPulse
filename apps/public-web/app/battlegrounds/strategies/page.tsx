import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { BattlegroundStrategiesPageClient } from '@/apps/public-web/ui/BattlegroundStrategiesPageClient';
import { BattlegroundBuildsPublicList, buildAnchor } from '@/apps/public-web/ui/BattlegroundBuildsPublicList';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicBattlegroundBuilds } from '@/apps/public-web/lib/publicBattlegroundBuilds';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered like the tier list: the open strategies (Firestone, by tier) are read from Express's
// anonymous projection; the builder and the closed statistics load in the browser for subscribers only.
// nginx sends query robots as X-Robots-Tag. A failed read keeps the last good copy instead of an empty page.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/battlegrounds/strategies', 'HearthPulse — конструктор стратегий Полей сражений');

export default async function Page() {
  const data = await loadPublicBattlegroundBuilds('strategies');
  return <>
    <SeoStructuredData path="/battlegrounds/strategies" data={data}
      items={data?.builds.map(build => ({ name: build.title, url: `https://hearthpulse.net/battlegrounds/strategies/#${buildAnchor(build)}` }))} />
    <BattlegroundStrategiesPageClient builds={<BattlegroundBuildsPublicList data={data} />} />
  </>;
}
