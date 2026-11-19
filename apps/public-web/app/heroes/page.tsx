import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { BattlegroundHeroesPageClient } from '@/apps/public-web/ui/BattlegroundHeroesPageClient';
import { BattlegroundHeroesPublicRanking } from '@/apps/public-web/ui/BattlegroundHeroesPublicRanking';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicBattlegroundHeroes } from '@/apps/public-web/lib/publicBattlegroundHeroes';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the open ranking (base range «Топ 50%», solo and duos)
// is read here from Express's anonymous projection, the narrower ranges and the patch
// dynamics load in the browser for subscribers only. nginx sends query robots as
// X-Robots-Tag. Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/heroes', 'HearthPulse — герои Полей сражений');

export default async function Page() {
  const { solo, duos } = await loadPublicBattlegroundHeroes();
  const first = solo ?? duos;
  return <>
    <SeoStructuredData path="/heroes" data={first}
      items={solo?.heroes.map(hero => ({ name: hero.name, url: `https://hearthpulse.net/heroes/${hero.dbfId}/` }))} />
    <BattlegroundHeroesPageClient ranking={<BattlegroundHeroesPublicRanking solo={solo} duos={duos} />} />
  </>;
}
