import type { Metadata } from 'next';
import { seoPageForExactPath } from '@/src/seo/registry';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImagePath } from '@/shared/shareImages';
import { searchParamsQuery } from './searchParams';

export type BattlegroundBuilderPath = '/battlegrounds/strategies' | '/battlegrounds/tier-builder';
export type BuilderSearch = Promise<Record<string, string | string[] | undefined>>;

export async function battlegroundBuilderMetadata(pathname: BattlegroundBuilderPath,
  searchParams: BuilderSearch): Promise<Metadata> {
  const seo = seoPageForExactPath(pathname);
  if (!seo) throw new Error(`Missing Battleground builder SEO contract: ${pathname}`);
  const policy = await resolvePublicUrlPolicy(pathname, searchParamsQuery(await searchParams));
  const canonical = `https://hearthpulse.net${pathname}/`;
  return {
    title: seo.title, description: seo.description,
    alternates: { canonical: policy.canonicalUrl ?? canonical },
    robots: policy.robots,
    openGraph: {
      type: 'website', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title: seo.title, description: seo.description,
      images: [{ url: shareImagePath('battlegrounds'), alt: seo.title, width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }],
    },
    twitter: { card: 'summary_large_image', title: seo.title, description: seo.description,
      images: [shareImagePath('battlegrounds')] },
  };
}
