import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicBattlegroundHeroes } from '@/apps/public-web/lib/publicBattlegroundHeroes';
import { ModeHubPage } from '@/apps/public-web/ui/ModeHubPage';
import { BattlegroundsNow } from '@/apps/public-web/ui/ModeHubNow';

// The Battlegrounds hub: the head of the open hero ranking, regenerated every five minutes (docs/specs/seo-query-clusters.md).
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/battlegrounds', 'HearthPulse — Поля сражений Hearthstone');

export default async function Page() {
  const { solo, duos } = await loadPublicBattlegroundHeroes();
  return <ModeHubPage hub="battlegrounds" updatedAt={(solo ?? duos)?.updatedAt}>
    {solo || duos ? <BattlegroundsNow solo={solo} duos={duos} /> : null}
  </ModeHubPage>;
}
