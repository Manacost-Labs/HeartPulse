import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import '@/src/features/DeferredRoutes.css';
import { loadPublicArticles } from '@/apps/public-web/lib/publicArticles';
import { ArticlesPageClient } from '@/apps/public-web/ui/ArticlesPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/articles', 'HearthPulse — статьи Hearthstone');

export default async function Page() {
  return <>
    <SeoStructuredData path="/articles" />
    <ArticlesPageClient initialData={await loadPublicArticles()} />
  </>;
}
