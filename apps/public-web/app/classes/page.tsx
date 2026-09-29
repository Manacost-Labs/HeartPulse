import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { ClassesPageClient } from '@/apps/public-web/ui/ClassesPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/classes', 'HearthPulse — классы Арены');

export default function Page() {
  return <ClassesPageClient />;
}
