import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { ClassesPageClient } from '@/apps/public-web/ui/ClassesPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { arenaClassesSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { loadPublicClassesTeaser } from '@/apps/public-web/lib/publicClassesTeaser';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the open slice (the order of the classes with
// the winrate to 0.1, sample, colour, date) is read here from Express's anonymous
// projection and rendered in the subscriber's ranking for everyone; the protected
// ranking loads in the browser for subscribers only. nginx sends query robots as X-Robots-Tag. Regeneration picks up
// runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/classes', 'HearthPulse — классы Арены',
  async () => arenaClassesSeoValues(await loadPublicClassesTeaser(), Date.now()));

export default async function Page() {
  const teaser = await loadPublicClassesTeaser();
  // Regenerating at runtime without data throws: Next does not publish the result and keeps the earlier copy.
  // Only the build, which has no Express, prints the stub; regenerated copies live in memory (`isrFlushToDisk:
  // false`), so after a deploy or restart the warm-up replaces it (#631, as /legendaries/ and /standard/matchups/).
  if (!teaser && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('Open Arena class ranking unavailable: the earlier copy stays');
  }
  return <>
    <SeoStructuredData path="/classes" data={teaser} />
    <ClassesPageClient teaser={teaser} />
  </>;
}
