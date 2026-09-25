import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cosmeticsDetailPath } from '../../../../../../src/modules/cosmetics/public';
import { cosmeticsDetailSeo } from '../../../../lib/cosmeticsDetailSeo';
import { loadPublicCosmeticsDetail, typedCosmeticsKind } from '../../../../lib/publicCosmeticsDetail';
import { CosmeticsPageClient } from '../../../../ui/CosmeticsPageClient';

type Props = { params: Promise<{ kind: string; cardId: string }> };
export const dynamic = 'force-dynamic';

async function resolveDetail(params: Props['params']) {
  const { kind, cardId } = await params;
  const pathname = cosmeticsDetailPath(kind, cardId);
  if (!pathname) notFound();
  const detail = await loadPublicCosmeticsDetail(kind, cardId);
  if (!detail) notFound();
  return { kind: typedCosmeticsKind(kind), detail, pathname };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind, detail } = await resolveDetail(params);
  const { canonical, title, description, image } = cosmeticsDetailSeo(kind, detail);
  return {
    title, description, alternates: { canonical },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title, description, images: image ? [image] : [] },
  };
}

export default async function Page({ params }: Props) {
  const { kind, detail, pathname } = await resolveDetail(params);
  const { structured } = cosmeticsDetailSeo(kind, detail);
  return <>
    <script type="application/ld+json" data-server-entity-jsonld data-entity-path={pathname}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
    <CosmeticsPageClient pathname={pathname} search="" initialDetail={detail} />
  </>;
}
