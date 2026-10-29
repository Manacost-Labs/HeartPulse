import { seoStructuredDataGraphOf, type SchemaNode, type SeoStructuredDataGraph } from './structuredData';

const SITE_ORIGIN = 'https://hearthpulse.net';
const BRAND_SUFFIX = / \| HearthPulse$/;

/** What an archetype page prints about itself: the JSON-LD says no more than the public teaser does. */
export type ArchetypeStructuredDataFacts = {
  /** The URL family the page was opened under; only `archetypes` is canonical and indexable. */
  family: 'archetypes' | 'meta';
  format: 'standard' | 'wild';
  slug: string;
  /** The Russian name the page's H1 and breadcrumb print. */
  label: string;
  /** The source's own (English) name of the archetype. */
  englishName: string;
  /** «Стандарт» */
  formatLabel: string;
  /** «Баны / Тёмная империя»; `null` when the answer names no window. */
  period: string | null;
  /** The page's meta title and description: the graph repeats them. */
  title: string;
  description: string;
  /** The teaser's numbers, copied as they are; a metric the source does not have is left out. */
  winrate: number | null;
  popularity: number | null;
  games: number;
  /** The teaser's `updatedAt`, as the data note prints it. */
  dateModified: string | null | undefined;
  /** An https address on HSGuru, or none. */
  sourceUrl: string | null;
};

function measured(name: string, value: number | null, unitText?: string): SchemaNode[] {
  return value === null ? [] : [{ '@type': 'PropertyValue', name, ...(unitText ? { unitText } : {}), value }];
}

/**
 * JSON-LD of an archetype page: an `ItemPage` whose main entity is the
 * `Dataset` of the archetype's public numbers, the breadcrumb the page shows
 * and the `Organization` the dataset points at. `null` unless the path is
 * indexable. The caller asks it only for an archetype that passes
 * `isIndexableArchetype`; paid data (builds, deck codes, history, analysis)
 * has no input here.
 *
 * The breadcrumb repeats the visible one («Архетипы / Стандарт / Название»)
 * without the step that has no address of its own: the format is a switch of
 * the catalog, not a page.
 */
export function archetypeStructuredDataGraph(facts: ArchetypeStructuredDataFacts): Promise<SeoStructuredDataGraph | null> {
  const path = `/standard/${facts.family}/${facts.format}/${facts.slug}`;
  const url = `${SITE_ORIGIN}${path}/`;
  const periodNote = facts.period ? `, период «${facts.period}»` : '';
  const nodes: SchemaNode[] = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Архетипы', item: `${SITE_ORIGIN}/standard/archetypes/` },
        { '@type': 'ListItem', position: 2, name: facts.label, item: url },
      ],
    },
    {
      '@type': 'ItemPage',
      '@id': `${url}#page`,
      url,
      name: facts.title.replace(BRAND_SUFFIX, ''),
      description: facts.description,
      isPartOf: { '@type': 'WebSite', '@id': `${SITE_ORIGIN}/#website`, name: 'HearthPulse', url: `${SITE_ORIGIN}/` },
      mainEntity: { '@id': `${url}#dataset` },
    },
    {
      '@type': 'Dataset',
      '@id': `${url}#dataset`,
      url,
      name: `${facts.label}: винрейт и популярность (${facts.formatLabel})`,
      description: `Публичная статистика архетипа «${facts.label}» (${facts.formatLabel}${periodNote}): винрейт, популярность и число игр по данным HSGuru. Сборки, коды колод и история — по подписке.`,
      ...(facts.sourceUrl ? { isBasedOn: { '@type': 'Dataset', name: `HSGuru: ${facts.englishName}`, url: facts.sourceUrl } } : {}),
      variableMeasured: [
        ...measured('Винрейт', facts.winrate, '%'),
        ...measured('Популярность', facts.popularity, '%'),
        ...measured('Число игр', facts.games),
      ],
      about: { '@type': 'VideoGame', name: 'Hearthstone' },
    },
  ];
  return seoStructuredDataGraphOf(path, nodes, { dateModified: facts.dateModified, sourceUrl: facts.sourceUrl });
}
