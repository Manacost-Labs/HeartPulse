import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

type SitemapUrlEntry = { location: string; lastmod?: string };
type XmlLimits = { maxEntries?: number; maxBytes?: number };

const LASTMOD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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
    if (entry.lastmod && !LASTMOD_PATTERN.test(entry.lastmod)) throw new Error('Sitemap contains an invalid lastmod');
    return `  <url><loc>${escapeXml(entry.location)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`;
  });
  return assertXmlSize(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`,
    maxBytes,
  );
}

export function renderSitemapIndex(entries: SitemapUrlEntry[], limits: XmlLimits = {}): string {
  const maxEntries = Math.min(MAX_SITEMAP_ENTRIES, Math.max(1, limits.maxEntries ?? MAX_SITEMAP_ENTRIES));
  const maxBytes = Math.min(MAX_SITEMAP_BYTES, Math.max(256, limits.maxBytes ?? MAX_SITEMAP_BYTES));
  if (entries.length > maxEntries) throw new Error(`Sitemap index exceeds the 50,000 URL limit (${entries.length})`);
  const locations = entries.map(entry => entry?.location);
  if (new Set(locations).size !== locations.length || locations.some(location => !location)) {
    throw new Error('Sitemap index contains an invalid or duplicate location');
  }
  const rows = entries.map(entry => {
    if (entry.lastmod && !LASTMOD_PATTERN.test(entry.lastmod)) throw new Error('Sitemap index contains an invalid lastmod');
    return `  <sitemap><loc>${escapeXml(entry.location)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</sitemap>`;
  });
  return assertXmlSize(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>\n`,
    maxBytes,
  );
}

/** The `<url>` entries of a `<urlset>` this project rendered: the address and, when written, its `lastmod`. */
export function parseSitemapEntries(xml: string): SitemapUrlEntry[] {
  if (!/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(xml)) return [];
  return [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>)?\s*<\/url>/gi)]
    .map(match => ({
      location: match[1]
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&'),
      ...(match[2] ? { lastmod: match[2] } : {}),
    }));
}

/** Content fingerprints of the static pages by address, written by the build; empty when the file is absent or unreadable. */
function readStaticFingerprints(pathname: string): Map<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(pathname, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    return new Map(Object.entries(parsed).filter((pair): pair is [string, string] => (
      typeof pair[1] === 'string' && /^[a-f0-9]{64}$/.test(pair[1])
    )));
  } catch {
    return new Map();
  }
}

export function loadStaticSitemapArtifact(
  candidates: string[],
  options: { required: boolean; onMissing?: (message: string) => void },
): { path: string; urls: string[]; fingerprints: Map<string, string>; modifiedAt: number } | null {
  const pathname = candidates.find(candidate => existsSync(candidate));
  if (!pathname) {
    const message = 'Static sitemap artifact is missing; run the production build before starting sitemap routing';
    if (options.required) throw new Error(message);
    options.onMissing?.(message);
    return null;
  }
  const entries = parseSitemapEntries(readFileSync(pathname, 'utf8'));
  if (entries.length === 0) throw new Error('Static sitemap artifact is invalid or empty');
  return {
    path: pathname,
    urls: entries.map(entry => entry.location),
    fingerprints: readStaticFingerprints(join(dirname(pathname), 'static-fingerprints.json')),
    modifiedAt: statSync(pathname).mtimeMs,
  };
}
