import { notFound } from 'next/navigation';
import { loadMetaReportDates } from '@/apps/public-web/lib/publicMetaReports';
import { metaReportArchiveNodes } from '@/apps/public-web/lib/metaReportStructuredData';
import { reportPath, reportTitle } from '@/apps/public-web/lib/metaReportText';
import type { Metadata } from 'next';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImagePath } from '@/shared/shareImages';
import { isIndexableMetaReportArchive } from '@/shared/metaReportIndexing';
import { robotsContent } from '@/src/shared/seo/robots';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { MetaReportArchive } from '@/apps/public-web/ui/MetaReportPage';
import { MetaReportJsonLd } from '@/apps/public-web/ui/MetaReportJsonLd';

// The archive of the weekly meta reports (docs/specs/meta-report-snapshots.md, «Report pages»). An empty
// archive is a 404: there is nothing to list yet. It is not in config/public-seo-pages.json, whose pages must
// answer 200 without data; robots and canonical come from the route inventory, and the page itself keeps
// `noindex, follow` and prints no JSON-LD until it lists two reports (`isIndexableMetaReportArchive`).
export const dynamic = 'force-dynamic';

const TITLE = 'Мета-отчёты Hearthstone по неделям | HearthPulse';
const DESCRIPTION = 'Еженедельные отчёты о мете Hearthstone: лучшие и популярные архетипы Стандарта, матчапы, классы Арены '
  + 'и герои Полей сражений на каждый понедельник.';

export async function generateMetadata(): Promise<Metadata> {
  const [policy, dates] = await Promise.all([resolvePublicUrlPolicy('/reports/meta/', ''), loadMetaReportDates()]);
  return {
    title: { absolute: TITLE }, description: DESCRIPTION,
    robots: isIndexableMetaReportArchive(dates.length) ? policy.robots : robotsContent('noindex-follow'),
    ...(policy.canonicalUrl ? { alternates: { canonical: policy.canonicalUrl } } : {}),
    openGraph: { type: 'website', url: 'https://hearthpulse.net/reports/meta/', siteName: 'HearthPulse', locale: 'ru_RU', title: TITLE,
      description: DESCRIPTION,
      images: [{ url: shareImagePath(), alt: 'HearthPulse — мета-отчёты Hearthstone', width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }] },
  };
}

export default async function Page() {
  const dates = await loadMetaReportDates();
  if (!dates.length) notFound();
  return <>
    {isIndexableMetaReportArchive(dates.length) ? <MetaReportJsonLd path="/reports/meta/" nodes={metaReportArchiveNodes(DESCRIPTION)}
      facts={{ items: dates.map(date => ({ name: reportTitle(date), url: `https://hearthpulse.net${reportPath(date)}` })) }} /> : null}
    <MetaReportArchive dates={dates} />
  </>;
}
