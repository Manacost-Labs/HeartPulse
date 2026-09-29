'use client';

import dynamic from 'next/dynamic';
import { memo } from 'react';
import FAQSection from '@/src/components/FAQSection';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import HomeTab, { type HomeArticle, type HomeSummaryData } from '@/src/modules/home/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';

const ReaderAccountRoute = dynamic(() => import('@/src/modules/browserIdentity/public'), {
  ssr: false,
  loading: () => <div role="status">Загружается вход…</div>,
});

// The account check re-renders the shell during hydration. With stable props
// the home content skips that update, so React keeps the server-rendered
// sections instead of swapping in their loading state while lazy chunks load.
const StableHomeTab = memo(HomeTab);
const faqSection = <FAQSection />;

export function HomePageClient({ summary, articles, login }: {
  summary: HomeSummaryData | null;
  articles: HomeArticle[];
  login: boolean;
}) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname={login ? '/profile/' : '/'} account={login}
    access={access} navigate={navigate}>
    {login ? <ReaderAccountRoute connect={false} profileId={null} user={access.user}
      checking={access.checking} onChange={access.onAuthChange} />
      : <StableHomeTab homeSummaryData={summary} loadingHomeSummary={false} articles={articles}
        serverArticles
        loadingArticles={false} faq={faqSection}
        onNavigate={navigateTab} />}
  </PublicPageShell>;
}
