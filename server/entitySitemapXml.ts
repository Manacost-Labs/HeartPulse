import { existsSync, readFileSync, statSync } from 'node:fs';

type SitemapUrlEntry = { location: string; lastmod?: string };
type XmlLimits = { maxEntries?: number; maxBytes?: number };

const MAX_SITEMAP_ENTRIES = 50_000;
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function assertXmlSize(xml: string, maximum: number): string {
  if (Buffer.byteLength(xml, 'utf8') > maximum) throw new Error(`Sitemap document exceeds ${maximum} bytes`);
  return xml;
}

export function renderSitemapUrlset(entries: SitemapUrlEntry[], limits: XmlLimits = {}): string {
  const maxEntries = Math.min(MAX_SITEMAP_ENTRIES, Math.max(1, limits.maxEntries ?? MAX_SITEMAP_ENTRIES));
  const maxBytes = Math.min(MAX_SITEMAP_BYTES, Math.max(256, limits.maxBytes ?? MAX_SITEMAP_BYTES));
  if (entries.length > maxEntries) throw new Error(`Sitemap exceeds the 50,000 URL limit (${entries.length})`);
  const locations = new Set<string>();
  const rows = entries.map(entry => {
    if (!entry?.location || locations.has(entry.location)) throw new Error('Sitemap contains an invalid or duplicate location');
    locations.add(entry.location);
    if (entry.lastmod && !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)) throw new Error('Sitemap contains an invalid lastmod');
    return `  <url><loc>${escapeXml(entry.location)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`;
  });
  return assertXmlSize(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`,
    maxBytes,
  );
}

export function renderSitemapIndex(locations: string[], limits: XmlLimits = {}): string {
  const maxEntries = Math.min(MAX_SITEMAP_ENTRIES, Math.max(1, limits.maxEntries ?? MAX_SITEMAP_ENTRIES));
  const maxBytes = Math.min(MAX_SITEMAP_BYTES, Math.max(256, limits.maxBytes ?? MAX_SITEMAP_BYTES));
  if (locations.length > maxEntries) throw new Error(`Sitemap index exceeds the 50,000 URL limit (${locations.length})`);
  if (new Set(locations).size !== locations.length || locations.some(location => !location)) {
    throw new Error('Sitemap index contains an invalid or duplicate location');
  }
  const rows = locations.map(location => `  <sitemap><loc>${escapeXml(location)}</loc></sitemap>`);
  return assertXmlSize(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>\n`,
    maxBytes,
  );
}

export function parseSitemapLocations(xml: string): string[] {
  if (!/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(xml)) return [];
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(match => match[1]
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&'));
}

export function loadStaticSitemapArtifact(
  candidates: string[],
  options: { required: boolean; onMissing?: (message: string) => void },
): { path: string; urls: string[]; modifiedAt: number } | null {
  const pathname = candidates.find(candidate => existsSync(candidate));
  if (!pathname) {
    const message = 'Static sitemap artifact is missing; run the production build before starting sitemap routing';
    if (options.required) throw new Error(message);
    options.onMissing?.(message);
    return null;
  }
  const urls = parseSitemapLocations(readFileSync(pathname, 'utf8'));
  if (urls.length === 0) throw new Error('Static sitemap artifact is invalid or empty');
  return { path: pathname, urls, modifiedAt: statSync(pathname).mtimeMs };
}
