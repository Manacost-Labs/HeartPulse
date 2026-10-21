'use client';

import dynamic from 'next/dynamic';
import { lazy } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import type { HomeArticle, HomeSummaryData } from '@/src/modules/home/public';
import { AccountPlanCardSlot, LoginCardSkeleton } from '@/src/modules/identity/public';
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
        <ReaderAccountRoute connect={false} profileId={null} user={access.user}
          checking={access.checking || access.provisional} onChange={access.onAuthChange} />
      </AccountPlanCardSlot.Provider>
    </div>
      : <HomePageContent summary={summary} articles={articles} onNavigate={navigateTab} />}
  </PublicPageShell>;
}
