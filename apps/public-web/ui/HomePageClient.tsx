'use client';

import dynamic from 'next/dynamic';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import type { HomeArticle, HomeSummaryData } from '@/src/modules/home/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';
import { HomePageContent } from './HomePageContent';

const ReaderAccountRoute = dynamic(() => import('@/src/modules/browserIdentity/public'), {
  ssr: false,
  loading: () => <div role="status">Загружается вход…</div>,
});

export function HomePageClient({ summary, articles, login }: {
  summary: HomeSummaryData | null;
  articles: HomeArticle[] | null;
  login: boolean;
}) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname={login ? '/profile/' : '/'} account={login}
    access={access} navigate={navigate}>
    {login ? <div style={{ minHeight: '100svh' }}>
      <ReaderAccountRoute connect={false} profileId={null} user={access.user}
        checking={access.checking} onChange={access.onAuthChange} />
    </div>
      : <HomePageContent summary={summary} articles={articles} onNavigate={navigateTab} />}
  </PublicPageShell>;
}
