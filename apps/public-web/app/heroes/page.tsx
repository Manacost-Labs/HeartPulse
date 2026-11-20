import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { BattlegroundHeroesPageClient } from '@/apps/public-web/ui/BattlegroundHeroesPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { battlegroundHeroesSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { loadPublicBattlegroundHeroes } from '@/apps/public-web/lib/publicBattlegroundHeroes';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the open ranking (base range «Топ 50%», solo and duos)
// is read here from Express's anonymous projection, the narrower ranges and the patch
// dynamics load in the browser for subscribers only. nginx sends query robots as
// X-Robots-Tag. Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/heroes', 'HearthPulse — герои Полей сражений',
  async () => battlegroundHeroesSeoValues((await loadPublicBattlegroundHeroes()).solo, Date.now()));

export default async function Page() {
  const { solo, duos } = await loadPublicBattlegroundHeroes();
  // Regenerating at runtime without data throws: Next does not publish the result and keeps the earlier copy
  // (also after a restart, when it is the copy on disk). Only the build, which has no Express, prints the stub;
  // the warm-up after a deploy replaces it (#631, as /legendaries/ and /standard/matchups/).
  if (!solo && !duos && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('Open hero ranking unavailable: the earlier copy stays');
  }
  const first = solo ?? duos;
  return <>
    <SeoStructuredData path="/heroes" data={first}
      items={solo?.heroes.map(hero => ({ name: hero.name, url: `https://hearthpulse.net/heroes/${hero.dbfId}/` }))} />
    <BattlegroundHeroesPageClient solo={solo} duos={duos} />
  </>;
}
