import { PublicSupportPage } from '@/apps/public-web/ui/PublicSupportPage';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
export const generateMetadata = seoStaticPageMetadata('/privacy', 'HearthPulse — политика конфиденциальности');
export default function Page() { return <><SeoStructuredData path="/privacy" /><PublicSupportPage page="privacy" /></>; }
