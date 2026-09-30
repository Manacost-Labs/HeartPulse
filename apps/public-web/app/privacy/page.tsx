import { PublicSupportPage } from '@/apps/public-web/ui/PublicSupportPage';
import { INDEXABLE_ROBOTS } from '@/src/shared/seo/robots';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
export const metadata = {
  title: 'Политика конфиденциальности | HearthPulse', description: 'Обработка персональных данных и настройки приватности HearthPulse.',
  alternates: { canonical: 'https://hearthpulse.net/privacy/' }, robots: INDEXABLE_ROBOTS,
};
export default function Page() { return <><SeoStructuredData path="/privacy" /><PublicSupportPage page="privacy" /></>; }
