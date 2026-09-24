'use client';

import dynamic from 'next/dynamic';
import FAQSection from '../../../src/components/FAQSection';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { NAVIGATION_ROUTES } from '../../../src/app/routing/navigationDefinitions';
import HomeTab, { type HomeArticle, type HomeSummaryData } from '../../../src/modules/home/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => { window.location.assign(path); };
const ReaderAccountRoute = dynamic(() => import('../../../src/modules/browserIdentity/public'), {
  ssr: false,
  loading: () => <div role="status">Загружается вход…</div>,
});
const navigateTab = (tab: string) => {
  const route = NAVIGATION_ROUTES.find(item => item.id === tab);
  if (!route) throw new Error('Unknown home destination');
  navigate(route.path);
};

export function HomePageClient({ summary, articles, login }: {
  summary: HomeSummaryData | null;
  articles: HomeArticle[];
  login: boolean;
}) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname={login ? '/profile/' : '/'} access={access} navigate={navigate}>
    {login ? <ReaderAccountRoute connect={false} profileId={null} user={access.user}
      checking={access.checking} onChange={access.onAuthChange} />
      : <HomeTab homeSummaryData={summary} loadingHomeSummary={false} articles={articles}
        serverArticles
        loadingArticles={false} faq={<FAQSection />}
        onNavigate={navigateTab} />}
  </PublicPageShell>;
}
