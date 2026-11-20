import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicStandardMetaTeaser } from '@/apps/public-web/lib/publicStandardMetaTeaser';
import { ModeHubPage } from '@/apps/public-web/ui/ModeHubPage';
import { StandardNow } from '@/apps/public-web/ui/ModeHubNow';

// The Standard hub: prerendered and regenerated every five minutes with the open meta slice; without it the
// text and the links stay (docs/specs/seo-query-clusters.md, «Mode hubs»).
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/standard', 'HearthPulse — Стандарт Hearthstone');

export default async function Page() {
  const meta = await loadPublicStandardMetaTeaser();
  return <ModeHubPage hub="standard" updatedAt={meta?.data.updatedAt}>
    {meta ? <StandardNow seed={meta} /> : null}
  </ModeHubPage>;
}
