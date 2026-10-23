'use client';

import dynamic from 'next/dynamic';
import { lazy } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import type { HomeArticle, HomeSummaryData } from '@/src/modules/home/public';
import { AccountGameStatsSlot, AccountPlanCardSlot, LoginCardSkeleton } from '@/src/modules/identity/public';
import '@/src/shared/ui/LoadingSurface.css';
import '@/src/modules/identity/ui/LoginCardSkeleton.css';
import { usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';
import { HomePageContent } from './HomePageContent';

const ReaderAccountRoute = dynamic(() => import('@/src/modules/browserIdentity/public'), {
  ssr: false,
  loading: () => <LoginCardSkeleton />,
});

// The Valyro plan card lives outside the identity module (modules may not
// import src/vendor); it loads only when a subscriber's plan is on screen.
const AccountBillingPlanCard = lazy(() => import('@/src/features/AccountBillingPlanCard'));
// The game statistics are Valyro-based for the same reason; they load with the signed-in account only.
const PlayerStatsPanel = lazy(() => import('@/src/features/playerStats/PlayerStatsPanel'));

export function HomePageClient({ summary, articles, login }: {
  summary: HomeSummaryData | null;
  articles: HomeArticle[] | null;
  login: boolean;
}) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname={login ? '/profile/' : '/'} account={login}
    access={access} navigate={navigate}>
    {login ? <div style={{ minHeight: '100svh' }}>
      <AccountPlanCardSlot.Provider value={AccountBillingPlanCard}>
        <AccountGameStatsSlot.Provider value={PlayerStatsPanel}>
          <ReaderAccountRoute connect={false} user={access.user}
            checking={access.checking || access.provisional} onChange={access.onAuthChange} />
        </AccountGameStatsSlot.Provider>
      </AccountPlanCardSlot.Provider>
    </div>
      : <HomePageContent summary={summary} articles={articles} onNavigate={navigateTab} />}
  </PublicPageShell>;
}
