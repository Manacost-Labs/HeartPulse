import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { battlegroundBuilderMetadata, type BuilderSearch } from '@/apps/public-web/lib/battlegroundBuilderMetadata';
import { BattlegroundStrategiesPageClient } from '@/apps/public-web/ui/BattlegroundStrategiesPageClient';
import { BattlegroundBuildsPublicList, buildAnchor } from '@/apps/public-web/ui/BattlegroundBuildsPublicList';
import { loadPublicBattlegroundBuilds } from '@/apps/public-web/lib/publicBattlegroundBuilds';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Rendered per request because the robots policy depends on the query (a builder link with `strategy` is not
// indexed). The open strategies (Firestone, by tier) are read from Express's anonymous projection through the
// data cache (five minutes); the builder and the closed statistics load in the browser for subscribers only.
// A failed read keeps the last good list of the process instead of an empty page.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: BuilderSearch }) {
  return battlegroundBuilderMetadata('/battlegrounds/strategies', searchParams);
}

export default async function Page() {
  const data = await loadPublicBattlegroundBuilds('strategies', false);
  return <>
    <SeoStructuredData path="/battlegrounds/strategies" data={data}
      items={data?.builds.map(build => ({ name: build.title, url: `https://hearthpulse.net/battlegrounds/strategies/#${buildAnchor(build)}` }))} />
    <BattlegroundStrategiesPageClient builds={<BattlegroundBuildsPublicList data={data} />} />
  </>;
}
