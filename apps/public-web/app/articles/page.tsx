import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import '@/src/features/DeferredRoutes.css';
import { loadPublicArticles } from '@/apps/public-web/lib/publicArticles';
import { ArticlesPageClient } from '@/apps/public-web/ui/ArticlesPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and regenerated every 5 minutes (PRERENDERED_DATA_REVALIDATE_SECONDS),
// so a link prefetch brings the whole page and opening it needs no server
// round trip. Nginx sends query robots as X-Robots-Tag.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/articles', 'HearthPulse — статьи Hearthstone');

export default async function Page() {
  return <>
    <PageBannerPreload />
    <SeoStructuredData path="/articles" />
    <ArticlesPageClient initialData={await loadPublicArticles()} />
  </>;
}
