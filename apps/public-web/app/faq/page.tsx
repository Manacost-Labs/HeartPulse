import { PublicSupportPage } from '@/apps/public-web/ui/PublicSupportPage';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
export const generateMetadata = seoStaticPageMetadata('/faq', 'HearthPulse — помощь и частые вопросы');
export default function Page() { return <><SeoStructuredData path="/faq" /><PublicSupportPage page="faq" /></>; }
