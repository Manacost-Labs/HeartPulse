'use client';

import dynamic from 'next/dynamic';
import FAQSection from '@/src/components/FAQSection';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import HomeTab, { type HomeArticle, type HomeSummaryData } from '@/src/modules/home/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';

const ReaderAccountRoute = dynamic(() => import('@/src/modules/browserIdentity/public'), {
  ssr: false,
  loading: () => <div role="status">Загружается вход…</div>,
});

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
      : <HomeTab homeSummaryData={summary} loadingHomeSummary={false} articles={articles}
        serverArticles
        loadingArticles={false} faq={<FAQSection />}
        onNavigate={navigateTab} />}
  </PublicPageShell>;
}
