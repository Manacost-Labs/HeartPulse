import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TierListPageClient } from '@/apps/public-web/ui/TierListPageClient';
import { loadPublicTierlist } from '@/apps/public-web/lib/publicTierlist';
import { compactTierlistClass } from '@/apps/public-web/lib/openTierlistView';
import { tierlistClassIdFromSlug, tierlistClassPath } from '@/apps/public-web/lib/tierlistClassPages';
import { tierlistClassSeoText } from '@/apps/public-web/lib/tierlistClassSeo';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { tierlistClassStructuredNodes } from '@/apps/public-web/lib/tierlistClassStructuredData';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
// The generic «nodes → graph» JSON-LD script (named for the page that introduced it).
import { MetaReportJsonLd as PageJsonLd } from '@/apps/public-web/ui/MetaReportJsonLd';

type Props = { params: Promise<{ class: string }> };

// A class page of the Arena tier list (#617): the subscriber's view on the open pool with the cards of one
// class (or the neutral cards) whole in the server HTML, read with the same cached loader as `/tierlist/`.
// ISR like `/tierlist/`, but no page is prerendered at build time: the build has no Express, so a build
// copy would have no cards. Each page is rendered on its first request (with the data) and then kept for
// five minutes. An unknown slug is a 404.
export const revalidate = 300;
export function generateStaticParams(): Array<{ class: string }> {
  return [];
}

async function classIdOf(params: Props['params']): Promise<string> {
  const { class: slug } = await params;
  return tierlistClassIdFromSlug(slug) ?? notFound();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [classId, pool] = await Promise.all([classIdOf(params), loadPublicTierlist()]);
  // The robots and canonical come from the route inventory: noindex, follow and none until SEO-A indexes the pages.
  const policy = await resolvePublicUrlPolicy(tierlistClassPath(classId), '');
  const { title, description } = tierlistClassSeoText(pool, classId, Date.now());
  return { title, description, robots: policy.robots,
    ...(policy.canonicalUrl ? { alternates: { canonical: policy.canonicalUrl } } : {}) };
}

export default async function Page({ params }: Props) {
  const [classId, pool] = await Promise.all([classIdOf(params), loadPublicTierlist()]);
  // Rendering without data throws, as on /tierlist/ (#631): a regeneration then keeps the earlier full copy, and a
  // first request while the source is down answers an error (noindex) instead of caching a page without cards for
  // five minutes. The build never renders these pages (`generateStaticParams` is empty); the check is kept for it.
  if (!pool && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('Open Arena tier list unavailable: the class page keeps its earlier copy');
  }
  const now = Date.now();
  return <>
    <PageJsonLd path={tierlistClassPath(classId)} nodes={tierlistClassStructuredNodes(classId, tierlistClassSeoText(pool, classId, now))}
      facts={{ dateModified: seoDataDate(pool?.updatedAt, now)?.iso }} />
    <TierListPageClient pool={pool ? compactTierlistClass(pool, classId) : null} classId={classId} />
  </>;
}
