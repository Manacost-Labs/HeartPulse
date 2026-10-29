import rawStructuredData from '../../config/public-seo-structured-data.json';
import { normalizePublicPathname, resolvePublicUrlPolicy } from '../shared/seo/publicUrlPolicy';
import { seoPageForExactPath } from './registry';

type SchemaValue = string | number | boolean | null | SchemaValue[] | { [key: string]: SchemaValue };
export type SchemaNode = { [key: string]: SchemaValue };
export type SeoStructuredDataGraph = { '@context': 'https://schema.org'; '@graph': SchemaNode[] };

const SITE_ORIGIN = 'https://hearthpulse.net';
const URL_KEYS = new Set(['@id', 'item', 'url']);
const LANGUAGE_TYPES = new Set(['WebSite', 'WebApplication', 'CollectionPage', 'ItemPage', 'Dataset', 'ItemList', 'FAQPage']);
const BREADCRUMB_LINKED_TYPES = new Set(['WebApplication', 'CollectionPage', 'ItemPage', 'Dataset', 'ItemList']);
// The page types whose text is the data the page shows, so the date of that data dates them.
const DATA_DATED_TYPES = new Set(['CollectionPage', 'ItemPage', 'Dataset']);

const { pages: PAGES, organization: ORGANIZATION } = rawStructuredData as {
  pages: Record<string, SchemaNode[]>;
  organization: SchemaNode;
};
const ORGANIZATION_REFERENCE = { '@id': String(ORGANIZATION['@id']) };

/** What a page knows about the data it shows; the JSON-LD says no more than the page prints. */
export type SeoStructuredDataFacts = {
  /**
   * When the data was last updated, from the source (not the server's clock).
   * Without a readable date the graph has no `dateModified` at all.
   */
  dateModified?: string | null;
  /** The address the data was read from; replaces the address of a Dataset's single `isBasedOn` source. */
  sourceUrl?: string | null;
};

function isoInstant(value: string | null | undefined): string | null {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function httpsAddress(value: string | null | undefined): string | null {
  return value && URL.canParse(value) && new URL(value).protocol === 'https:' ? value : null;
}

/** Points references to this page and to other registered pages at their canonical URLs. */
async function canonicalized(value: SchemaValue, pagePath: string, pageUrl: string, key = ''): Promise<SchemaValue> {
  if (Array.isArray(value)) return Promise.all(value.map(item => canonicalized(item, pagePath, pageUrl, key)));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value)
      .map(async ([childKey, child]) => [childKey, await canonicalized(child, pagePath, pageUrl, childKey)] as const));
    return Object.fromEntries(entries);
  }
  if (typeof value !== 'string' || !URL_KEYS.has(key) || !URL.canParse(value)) return value;
  const reference = new URL(value);
  if (reference.origin !== SITE_ORIGIN) return value;
  const path = normalizePublicPathname(reference.pathname);
  const canonical = path === pagePath
    ? pageUrl
    : seoPageForExactPath(path) ? (await resolvePublicUrlPolicy(path)).canonicalUrl : null;
  return canonical ? `${canonical}${reference.search}${reference.hash}` : value;
}

/**
 * JSON-LD graph of a page listed in `config/public-seo-structured-data.json`,
 * or `null` when the page has no entry or is not indexable. A date or window
 * is written only when the page's data supplies it: `dateModified` is the date
 * the data was updated, and there is no `temporalCoverage` because no source
 * names the window it covers. A page with a Dataset also carries the
 * `Organization` node its `creator` and `publisher` point at: Google resolves
 * an `@id` inside one document only.
 */
export async function seoStructuredDataGraph(pathname: string, facts: SeoStructuredDataFacts = {}): Promise<SeoStructuredDataGraph | null> {
  const pagePath = normalizePublicPathname(pathname);
  const nodes = PAGES[pagePath];
  return nodes?.length ? pageGraph(pagePath, nodes, facts) : null;
}

/**
 * The same graph for a page whose nodes are built from its data and so are not
 * in the registry (an archetype page): canonical URLs, language, breadcrumb
 * links, the data date, and the `Organization` and licence of every `Dataset`
 * are added exactly as for a registry page. `null` when the path is not indexable.
 */
export function seoStructuredDataGraphOf(pathname: string, nodes: readonly SchemaNode[], facts: SeoStructuredDataFacts = {}): Promise<SeoStructuredDataGraph | null> {
  return pageGraph(normalizePublicPathname(pathname), nodes, facts);
}

async function pageGraph(pagePath: string, nodes: readonly SchemaNode[], facts: SeoStructuredDataFacts): Promise<SeoStructuredDataGraph | null> {
  const policy = await resolvePublicUrlPolicy(pagePath);
  if (policy.indexPolicy !== 'index' || !policy.canonicalUrl) return null;

  const pageUrl = policy.canonicalUrl;
  const graph = await Promise.all(nodes.map(node => canonicalized(node, pagePath, pageUrl))) as SchemaNode[];
  const breadcrumb = graph.find(node => node['@type'] === 'BreadcrumbList');
  if (breadcrumb && !breadcrumb['@id']) breadcrumb['@id'] = `${pageUrl}#breadcrumb`;
  const dateModified = isoInstant(facts.dateModified);
  const sourceUrl = httpsAddress(facts.sourceUrl);
  for (const node of graph) {
    const type = String(node['@type']);
    if (!node.inLanguage && LANGUAGE_TYPES.has(type)) node.inLanguage = 'ru';
    if (breadcrumb && !node.breadcrumb && BREADCRUMB_LINKED_TYPES.has(type)) {
      node.breadcrumb = { '@id': breadcrumb['@id'] };
    }
    if (dateModified && DATA_DATED_TYPES.has(type)) node.dateModified = dateModified;
    if (type === 'Dataset') {
      // The site terms are the only reuse grant the owner has published.
      if (!node.license) node.license = `${SITE_ORIGIN}/terms/`;
      node.creator ??= { ...ORGANIZATION_REFERENCE };
      node.publisher ??= { ...ORGANIZATION_REFERENCE };
      const origin = node.isBasedOn;
      if (sourceUrl && origin && typeof origin === 'object' && !Array.isArray(origin)) origin.url = sourceUrl;
    }
  }
  if (graph.some(node => node['@type'] === 'Dataset')) {
    graph.unshift(await canonicalized(ORGANIZATION, pagePath, pageUrl) as SchemaNode);
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
