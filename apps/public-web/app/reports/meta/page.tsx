import { notFound } from 'next/navigation';
import { loadMetaReportDates } from '@/apps/public-web/lib/publicMetaReports';
import { metaReportArchiveNodes } from '@/apps/public-web/lib/metaReportStructuredData';
import { reportPath, reportTitle } from '@/apps/public-web/lib/metaReportText';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { MetaReportArchive } from '@/apps/public-web/ui/MetaReportPage';
import { MetaReportJsonLd } from '@/apps/public-web/ui/MetaReportJsonLd';

// The archive of the weekly meta reports (docs/specs/meta-report-snapshots.md, «Report pages»). An empty
// archive is a 404: there is nothing to list yet.
export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/reports/meta', 'HearthPulse — мета-отчёты Hearthstone');

const DESCRIPTION = 'Еженедельные отчёты о мете Hearthstone: Стандарт, матчапы, Арена и Поля сражений на каждый понедельник.';

export default async function Page() {
  const dates = await loadMetaReportDates();
  if (!dates.length) notFound();
  return <>
    <MetaReportJsonLd path="/reports/meta/" nodes={metaReportArchiveNodes(DESCRIPTION)}
      facts={{ items: dates.map(date => ({ name: reportTitle(date), url: `https://hearthpulse.net${reportPath(date)}` })) }} />
    <MetaReportArchive dates={dates} />
  </>;
}
