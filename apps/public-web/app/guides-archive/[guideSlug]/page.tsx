import type { Metadata } from 'next';
import { brandedTitle } from '@/shared/entityPageTitles';
import { notFound } from 'next/navigation';
import '@/src/route-parchment.css';
import '@/src/shared/ui/LoadingSurface.css';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImagePath } from '@/shared/shareImages';
import { robotsContent } from '@/src/shared/seo/robots';
import { loadPublicGuideTeaser } from '@/apps/public-web/lib/publicGuideTeaser';
import { buildGuideStructuredData } from '@/apps/public-web/lib/publicGuideTeaserStructuredData';
import { GuideArchiveExcerpt, GuideArchiveToc } from '@/apps/public-web/ui/GuideArchiveExcerpt';
import { SharedPageShell } from '@/apps/public-web/ui/SharedPageShell';
import { GuideArchiveDetailPageClient } from '@/apps/public-web/ui/GuideArchiveDetailPageClient';

type Props = { params: Promise<{ guideSlug: string }> };
export const dynamic = 'force-dynamic';

async function resolveGuide(params: Props['params']) {
  const { guideSlug } = await params;
  const teaser = await loadPublicGuideTeaser(guideSlug);
  if (!teaser) notFound();
  if (teaser === 'unavailable') return { teaser, pathname: '', canonical: '' };
  const pathname = `/guides-archive/${encodeURIComponent(guideSlug)}/`;
  const canonical = `https://hearthpulse.net/guides-archive/${encodeURIComponent(teaser.slug)}/`;
  return { teaser, pathname, canonical };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { teaser, pathname, canonical } = await resolveGuide(params);
  // Express did not answer: no title or canonical of a guide we cannot name, and nothing for search engines to keep.
  if (teaser === 'unavailable') return { title: 'Гайд — HearthPulse', robots: { index: false, follow: false } };
  const policy = await resolvePublicUrlPolicy(pathname, '');
  const title = brandedTitle(teaser.title);
  const description = teaser.description || `Архивный гайд Hearthstone: ${teaser.title}.`;
  return {
    title, description, alternates: { canonical },
    // One flag from the projection: the sitemap leaves the same guides out.
    robots: teaser.indexable ? policy.robots : robotsContent('noindex-follow'),
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU', title, description,
      images: teaser.image ? [teaser.image]
        : [{ url: shareImagePath('articles'), alt: teaser.title, width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }] },
  };
}

export default async function Page({ params }: Props) {
  const { teaser, pathname } = await resolveGuide(params);
  if (teaser === 'unavailable') {
    return <SharedPageShell pathname="/guides-archive/">
      <div className="guide-archive-detail" role="status">
        <h1>Гайд временно недоступен</h1>
        <p>Сайт сейчас перегружен. <a href="">Обновите страницу</a> через минуту или вернитесь в <a href="/guides-archive/">архив гайдов</a>.</p>
      </div>
    </SharedPageShell>;
  }
  const { excerptHtml, toc, ...header } = teaser;
  const excerptIds = new Set([...excerptHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  // A heading of the closed part has no element in the open text: it gets an anchor at the gate.
  const paidAnchors = teaser.hasPaid ? [...new Set(toc.map(entry => entry.id).filter(id => !excerptIds.has(id)))] : [];
  // A page that is not indexed carries no structured data, as everywhere else on the site.
  const structured = teaser.indexable
    ? buildGuideStructuredData(teaser, shareImagePath('articles')) : null;
  return <>
    {structured && <script type="application/ld+json" data-server-entity-jsonld
      data-entity-path={`/guides-archive/${teaser.slug}/`}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />}
    <GuideArchiveDetailPageClient pathname={pathname} teaser={header} hasPaid={teaser.hasPaid}
      toc={<GuideArchiveToc toc={toc} />} excerpt={<GuideArchiveExcerpt html={excerptHtml} />}
      paidAnchors={paidAnchors} />
  </>;
}
