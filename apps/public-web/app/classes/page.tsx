import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { ClassesPageClient } from '@/apps/public-web/ui/ClassesPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/classes', 'HearthPulse — классы Арены');

export default function Page() {
  return <>
    <SeoStructuredData path="/classes" />
    <ClassesPageClient />
  </>;
}
