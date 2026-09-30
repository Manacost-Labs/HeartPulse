import { PublicSupportPage } from '@/apps/public-web/ui/PublicSupportPage';
import { INDEXABLE_ROBOTS } from '@/src/shared/seo/robots';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
export const metadata = {
  title: 'Условия использования | HearthPulse', description: 'Условия использования сайта и сервисов HearthPulse.',
  alternates: { canonical: 'https://hearthpulse.net/terms/' }, robots: INDEXABLE_ROBOTS,
};
export default function Page() { return <><SeoStructuredData path="/terms" /><PublicSupportPage page="terms" /></>; }
