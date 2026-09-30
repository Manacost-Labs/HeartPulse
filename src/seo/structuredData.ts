import rawStructuredData from '../../config/public-seo-structured-data.json';
import { normalizePublicPathname, resolvePublicUrlPolicy } from '../shared/seo/publicUrlPolicy';
import { seoPageForExactPath } from './registry';

type SchemaValue = string | number | boolean | null | SchemaValue[] | { [key: string]: SchemaValue };
type SchemaNode = { [key: string]: SchemaValue };
export type SeoStructuredDataGraph = { '@context': 'https://schema.org'; '@graph': SchemaNode[] };

const SITE_ORIGIN = 'https://hearthpulse.net';
const URL_KEYS = new Set(['@id', 'item', 'url']);
const LANGUAGE_TYPES = new Set(['WebSite', 'WebApplication', 'CollectionPage', 'Dataset', 'ItemList', 'FAQPage']);
const BREADCRUMB_LINKED_TYPES = new Set(['WebApplication', 'CollectionPage', 'Dataset', 'ItemList']);
const DAY_MS = 24 * 3600 * 1000;

const PAGES = (rawStructuredData as { pages: Record<string, SchemaNode[]> }).pages;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
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
 * or `null` when the page has no entry or is not indexable. Dataset nodes
 * describe the rolling 30-day statistics window that ends on `now`.
 */
export async function seoStructuredDataGraph(pathname: string, now = new Date()): Promise<SeoStructuredDataGraph | null> {
  const pagePath = normalizePublicPathname(pathname);
  const nodes = PAGES[pagePath];
  if (!nodes?.length) return null;
  const policy = await resolvePublicUrlPolicy(pagePath);
  if (policy.indexPolicy !== 'index' || !policy.canonicalUrl) return null;

  const pageUrl = policy.canonicalUrl;
  const graph = await Promise.all(nodes.map(node => canonicalized(node, pagePath, pageUrl))) as SchemaNode[];
  const breadcrumb = graph.find(node => node['@type'] === 'BreadcrumbList');
  if (breadcrumb && !breadcrumb['@id']) breadcrumb['@id'] = `${pageUrl}#breadcrumb`;
  for (const node of graph) {
    const type = String(node['@type']);
    if (!node.inLanguage && LANGUAGE_TYPES.has(type)) node.inLanguage = 'ru';
    if (breadcrumb && !node.breadcrumb && BREADCRUMB_LINKED_TYPES.has(type)) {
      node.breadcrumb = { '@id': breadcrumb['@id'] };
    }
    if (type === 'Dataset') {
      if (!node.license) node.license = 'https://creativecommons.org/licenses/by/4.0/';
      node.temporalCoverage = `${isoDay(new Date(now.getTime() - 30 * DAY_MS))}/${isoDay(now)}`;
      node.dateModified = isoDay(now);
    }
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
