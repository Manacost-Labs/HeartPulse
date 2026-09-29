import '@/src/route-parchment.css';
import { GuidesArchivePageClient } from '@/apps/public-web/ui/GuidesArchivePageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/guides-archive', 'HearthPulse — архив гайдов');

export default function Page() {
  return <GuidesArchivePageClient />;
}
