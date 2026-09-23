'use client';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import FAQPage from '../../../src/features/FAQPage';
import LegalPage from '../../../src/modules/legalPages/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => { window.location.assign(path); };
export function PublicSupportPage({ page }: { page: 'faq' | 'privacy' | 'terms' }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab={page} pathname={`/${page}/`} access={access} navigate={navigate} editorial>
    {page === 'faq' ? <FAQPage navigatePath={navigate} /> : <LegalPage kind={page} navigatePath={navigate} />}
  </PublicPageShell>;
}
