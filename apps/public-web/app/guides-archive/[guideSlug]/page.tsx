import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../../../../../src/route-parchment.css';
import { resolvePublicUrlPolicy } from '../../../../../src/shared/seo/publicUrlPolicy';
import { loadPublicGuideTeaser } from '../../../lib/publicGuideTeaser';
import { GuideArchiveDetailPageClient } from '../../../ui/GuideArchiveDetailPageClient';

type Props = { params: Promise<{ guideSlug: string }> };
export const dynamic = 'force-dynamic';

async function resolveGuide(params: Props['params']) {
  const { guideSlug } = await params;
  const teaser = await loadPublicGuideTeaser(guideSlug);
  if (!teaser) notFound();
  const pathname = `/guides-archive/${encodeURIComponent(guideSlug)}/`;
  const canonical = `https://hearthpulse.net/guides-archive/${encodeURIComponent(teaser.slug)}/`;
  return { teaser, pathname, canonical };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { teaser, pathname, canonical } = await resolveGuide(params);
  const policy = await resolvePublicUrlPolicy(pathname, '');
  const title = `${teaser.title} | Manacost Stats`;
  const description = teaser.description || `Архивный гайд Hearthstone: ${teaser.title}.`;
  return {
    title, description, alternates: { canonical },
    robots: { index: policy.indexPolicy === 'index', follow: policy.indexPolicy !== 'noindex-nofollow' },
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU', title, description,
      images: teaser.image ? [teaser.image] : ['/assets/og-preview.png'] },
  };
}

export default async function Page({ params }: Props) {
  const { teaser, pathname } = await resolveGuide(params);
  return <GuideArchiveDetailPageClient pathname={pathname} teaser={teaser} />;
}
