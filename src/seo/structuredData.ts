import rawStructuredData from '../../config/public-seo-structured-data.json';
import { organizationNode, organizationReference, SITE_ORIGIN } from '../../shared/seoOrganization';
import { normalizePublicPathname, resolvePublicUrlPolicy } from '../shared/seo/publicUrlPolicy';
import { seoPageForExactPath } from './registry';

type SchemaValue = string | number | boolean | null | SchemaValue[] | { [key: string]: SchemaValue };
export type SchemaNode = { [key: string]: SchemaValue };
export type SeoStructuredDataGraph = { '@context': 'https://schema.org'; '@graph': SchemaNode[] };

const URL_KEYS = new Set(['@id', 'item', 'url']);
const LANGUAGE_TYPES = new Set(['WebSite', 'WebPage', 'CollectionPage', 'ItemPage', 'Dataset', 'ItemList', 'FAQPage']);
const BREADCRUMB_LINKED_TYPES = new Set(['WebPage', 'CollectionPage', 'ItemPage', 'Dataset', 'ItemList']);
/** An `ItemList` names at most this many entries; the page shows no more in its first screen of results. */
export const ITEM_LIST_LIMIT = 100;
// The page types whose text is the data the page shows, so the date of that data dates them.
const DATA_DATED_TYPES = new Set(['CollectionPage', 'ItemPage', 'Dataset']);

const { pages: PAGES } = rawStructuredData as { pages: Record<string, SchemaNode[]> };

/** What a page knows about the data it shows; the JSON-LD says no more than the page prints. */
export type SeoStructuredDataFacts = {
  /**
   * When the data was last updated, from the source (not the server's clock).
   * Without a readable date the graph has no `dateModified` at all.
   */
  dateModified?: string | null;
  /** The address the data was read from; replaces the address of a Dataset's single `isBasedOn` source. */
  sourceUrl?: string | null;
  /**
   * The entries of the list the page prints in its server-rendered HTML, in page order.
   * Only a page whose registry entry has a `CollectionPage` gets an `ItemList` from them;
   * entries beyond `ITEM_LIST_LIMIT`, repeated addresses and addresses off the site are dropped.
   */
  items?: readonly { name: string; url: string }[];
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
 * names the window it covers. Every graph carries the one `Organization` node
 * (`shared/seoOrganization.ts`) that `publisher` references point at: Google
 * resolves an `@id` inside one document only. A Dataset has no `creator` and no
 * `licence`. `facts.items` becomes an `ItemList` on a page with a `CollectionPage`.
 */
export async function seoStructuredDataGraph(pathname: string, facts: SeoStructuredDataFacts = {}): Promise<SeoStructuredDataGraph | null> {
  const pagePath = normalizePublicPathname(pathname);
  const nodes = PAGES[pagePath];
  return nodes?.length ? pageGraph(pagePath, nodes, facts) : null;
}

/**
 * The same graph for a page whose nodes are built from its data and so are not
 * in the registry (an archetype page): canonical URLs, language, breadcrumb
 * links, the data date, the `Organization` node and the `publisher` of every
 * `Dataset` are added exactly as for a registry page. `null` when the path is not indexable.
 */
export function seoStructuredDataGraphOf(pathname: string, nodes: readonly SchemaNode[], facts: SeoStructuredDataFacts = {}): Promise<SeoStructuredDataGraph | null> {
  return pageGraph(normalizePublicPathname(pathname), nodes, facts);
}

/** `ItemList` of the entries a page prints; `null` when it prints none that the list may name. */
function itemList(items: SeoStructuredDataFacts['items'], pageUrl: string): SchemaNode | null {
  const seen = new Set<string>();
  const entries: SchemaNode[] = [];
  for (const item of items ?? []) {
    const name = item.name.replace(/\s+/g, ' ').trim();
    const url = URL.canParse(item.url) ? new URL(item.url) : null;
    if (!name || !url || url.origin !== SITE_ORIGIN || seen.has(url.href)) continue;
    seen.add(url.href);
    entries.push({ '@type': 'ListItem', position: entries.length + 1, name, url: url.href });
    if (entries.length === ITEM_LIST_LIMIT) break;
  }
  return entries.length
    ? { '@type': 'ItemList', '@id': `${pageUrl}#list`, numberOfItems: entries.length, itemListElement: entries }
    : null;
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
      // The data is derived from other people's sources: the site names itself the
      // publisher, never the creator, and grants no licence the owner has not published
      // (the site terms are not a licence for the data), so neither key is ever written.
      delete node.creator;
      delete node.license;
      node.publisher ??= organizationReference();
      const origin = node.isBasedOn;
      if (sourceUrl && origin && typeof origin === 'object' && !Array.isArray(origin)) origin.url = sourceUrl;
    }
  }
  const list = itemList(facts.items, pageUrl);
  const collection = graph.find(node => node['@type'] === 'CollectionPage');
  if (list && collection && !collection.mainEntity) {
    collection.mainEntity = { '@id': list['@id'] };
    graph.push(list);
  }
  // Every graph carries the one organization node, so each `{"@id": ".../#org"}` resolves in place.
  graph.unshift(organizationNode());
  return { '@context': 'https://schema.org', '@graph': graph };
}
