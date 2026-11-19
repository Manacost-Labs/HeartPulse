import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { ClassesPageClient } from '@/apps/public-web/ui/ClassesPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicClassesTeaser } from '@/apps/public-web/lib/publicClassesTeaser';
import { ClassesPublicTeaser } from '@/apps/public-web/ui/ClassesPublicTeaser';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the full ranking loads in the browser for
// subscribers only, while the open slice (the order of the classes with the
// winrate to 0.1, games, date) is read here from Express's anonymous
// projection. nginx sends query robots as X-Robots-Tag. Regeneration picks up
// runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/classes', 'HearthPulse — классы Арены');

export default async function Page() {
  const teaser = await loadPublicClassesTeaser();
  return <>
    <SeoStructuredData path="/classes" data={teaser} />
    <ClassesPageClient hasOpenData={teaser !== null} teaser={<ClassesPublicTeaser data={teaser} />} />
  </>;
}
