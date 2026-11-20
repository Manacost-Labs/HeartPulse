import type { SchemaNode } from '@/src/seo/structuredData';
import { reportDateLabel, reportPath } from './metaReportText';

const SITE = 'https://hearthpulse.net';
const ARCHIVE_URL = `${SITE}/reports/meta/`;

const crumbs = (items: { name: string; item: string }[]): SchemaNode => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.item })),
});

/**
 * JSON-LD nodes of one weekly report: the page, its breadcrumbs and a `Dataset`
 * whose `temporalCoverage` is the date of the snapshot (not the date of the
 * request). `seoStructuredDataGraphOf` adds the organization, the language and
 * `dateModified`, and writes nothing while the page is not indexable.
 */
export function metaReportStructuredNodes(report: { date: string; title: string; description: string }): SchemaNode[] {
  const url = `${SITE}${reportPath(report.date)}`;
  return [
    crumbs([
      { name: 'Главная', item: SITE },
      { name: 'Мета-отчёты', item: ARCHIVE_URL },
      { name: reportDateLabel(report.date), item: url },
    ]),
    { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: report.title, description: report.description },
    {
      '@type': 'Dataset', '@id': `${url}#dataset`, url, name: report.title, description: report.description,
      temporalCoverage: report.date, isAccessibleForFree: true,
      isBasedOn: [
        { '@type': 'Dataset', name: 'HSGuru', url: 'https://www.hsguru.com/meta' },
        { '@type': 'Dataset', name: 'HSReplay', url: 'https://hsreplay.net/' },
      ],
      about: { '@type': 'VideoGame', name: 'Hearthstone' },
    },
  ];
}

/** JSON-LD nodes of the archive: a `CollectionPage` the graph builder gives an `ItemList` of the reports. */
export function metaReportArchiveNodes(description: string): SchemaNode[] {
  return [
    crumbs([{ name: 'Главная', item: SITE }, { name: 'Мета-отчёты', item: ARCHIVE_URL }]),
    { '@type': 'CollectionPage', '@id': `${ARCHIVE_URL}#webpage`, url: ARCHIVE_URL, name: 'Мета-отчёты Hearthstone по неделям', description },
  ];
}
