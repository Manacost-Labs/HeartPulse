import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicArchetypeCatalogTeaser } from '@/apps/public-web/lib/publicArchetypeCatalogTeaser';
import { loadMetaReport, loadMetaReportDates } from '@/apps/public-web/lib/publicMetaReports';
import { isMetaReportDate } from '@/apps/public-web/lib/publicMetaReportData';
import { buildMetaReportView } from '@/apps/public-web/lib/metaReportView';
import { metaReportDescription, reportPath, reportTitle } from '@/apps/public-web/lib/metaReportText';
import { metaReportStructuredNodes } from '@/apps/public-web/lib/metaReportStructuredData';
import { isIndexableArchetype } from '@/shared/constructedArchetypeIndexing';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImagePath } from '@/shared/shareImages';
import { robotsContent } from '@/src/shared/seo/robots';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { MetaReportJsonLd } from '@/apps/public-web/ui/MetaReportJsonLd';
import { MetaReportPage } from '@/apps/public-web/ui/MetaReportPage';

type Props = { params: Promise<{ date: string }> };
// One weekly meta report, rendered on the server from its snapshot (docs/specs/meta-report-snapshots.md,
// «Report pages»). An unknown date is a 404.
export const dynamic = 'force-dynamic';

async function resolveReport(params: Props['params']) {
  const { date } = await params;
  if (!isMetaReportDate(date)) notFound();
  const [snapshot, dates] = await Promise.all([loadMetaReport(date), loadMetaReportDates()]);
  if (!snapshot) notFound();
  const index = dates.indexOf(date);
  const previousDate = index >= 0 ? dates[index + 1] ?? null : dates.find(other => other < date) ?? null;
  const nextDate = index > 0 ? dates[index - 1] : null;
  const previous = previousDate ? await loadMetaReport(previousDate) : null;
  const view = buildMetaReportView(snapshot, previous);
  return { snapshot, view, previousDate, nextDate, description: metaReportDescription(view) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { snapshot, view, description } = await resolveReport(params);
  const pathname = reportPath(snapshot.date);
  const policy = await resolvePublicUrlPolicy(pathname, '');
  const title = `${reportTitle(snapshot.date)} | HearthPulse`;
  const url = `https://hearthpulse.net${pathname}`;
  // Early data (a patch younger than 72 hours) keeps a report out of the index even once reports are indexed.
  const robots = policy.indexPolicy === 'index' && view.earlyData ? robotsContent('noindex-follow') : policy.robots;
  return {
    // The canonical comes from the route inventory (self); the robots follow `isEarlyMetaReport` as the sitemap segment does.
    title: { absolute: title }, description, robots,
    ...(policy.canonicalUrl ? { alternates: { canonical: policy.canonicalUrl } } : {}),
    openGraph: { type: 'article', url, siteName: 'HearthPulse', locale: 'ru_RU', title, description,
      images: [{ url: shareImagePath(), alt: 'HearthPulse — мета-отчёт Hearthstone', width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }] },
  };
}

export default async function Page({ params }: Props) {
  // Archetype links go to live pages, so the open catalog of now decides which of them are indexable.
  const [{ snapshot, view, previousDate, nextDate, description }, catalog] = await Promise.all([
    resolveReport(params), loadPublicArchetypeCatalogTeaser(''),
  ]);
  const linkable = new Set((catalog?.items ?? []).filter(isIndexableArchetype).map(item => item.slug));
  return <>
    {view.earlyData ? null : <MetaReportJsonLd path={reportPath(snapshot.date)}
      nodes={metaReportStructuredNodes({ date: snapshot.date, title: reportTitle(snapshot.date), description })}
      facts={{ dateModified: snapshot.recordedAt }} />}
    <MetaReportPage snapshot={snapshot} view={view} previous={previousDate} next={nextDate} linkable={linkable} />
  </>;
}
