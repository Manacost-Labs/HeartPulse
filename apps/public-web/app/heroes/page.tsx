import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { BattlegroundHeroesPageClient } from '@/apps/public-web/ui/BattlegroundHeroesPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/heroes', 'HearthPulse — герои Полей сражений');

export default function Page() {
  return <>
    <link rel="preload" href="/wallpaper/profile-hero-hth.webp" as="image" fetchPriority="high" />
    <BattlegroundHeroesPageClient />
  </>;
}
