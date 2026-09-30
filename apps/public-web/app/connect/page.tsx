import '@/src/route-parchment.css';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { ApplicationConnectPageClient } from '@/apps/public-web/ui/ApplicationConnectPageClient';

export const generateMetadata = seoStaticPageMetadata('/connect');

export default function Page() {
  return <ApplicationConnectPageClient />;
}
