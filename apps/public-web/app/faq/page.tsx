import { PublicSupportPage } from '@/apps/public-web/ui/PublicSupportPage';
import { INDEXABLE_ROBOTS } from '@/src/shared/seo/robots';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
export const metadata = {
  title: 'Частые вопросы | HearthPulse', description: 'Ответы на вопросы об авторизации, подписках и статистике HearthPulse.',
  alternates: { canonical: 'https://hearthpulse.net/faq/' }, robots: INDEXABLE_ROBOTS,
};
export default function Page() { return <><SeoStructuredData path="/faq" /><PublicSupportPage page="faq" /></>; }
