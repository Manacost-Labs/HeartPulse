import FAQPage from '@/src/features/FAQPage';
import LegalPage from '@/src/modules/legalPages/public';
import { PublicSupportShell } from './PublicSupportShell';

// A server component: the help and legal texts reach the browser as HTML and in
// the RSC payload of the document; only the page shell is JavaScript to hydrate.
export function PublicSupportPage({ page }: { page: 'faq' | 'privacy' | 'terms' }) {
  return <PublicSupportShell page={page}>
    {page === 'faq' ? <FAQPage /> : <LegalPage kind={page} />}
  </PublicSupportShell>;
}
