import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Source directories whose files are the text of a page the registry does not
 * hold. A change in one of them is a change of the page's content. A page that
 * is absent here (a data page, which the server dates by its data) is
 * fingerprinted by its registry record alone.
 */
const PAGE_CONTENT_SOURCES = {
  '/faq': ['src/modules/helpCenter'],
  '/privacy': ['src/modules/legalPages'],
  '/terms': ['src/modules/legalPages'],
  '/developers/api': ['src/modules/developerApi'],
};
const CONTENT_FILE = /\.(?:tsx?|json|md)$/;
const NOT_CONTENT_FILE = /\.(?:test|stories)\./;

/**
 * JSON-backed public URL and SEO policy of the static-root builder. It must
 * stay free of `src/` TypeScript so release tooling needs no compile step.
 */
export function createPublicSeoModel(root = process.cwd()) {
  const inventory = readJson(root, 'src/shared/seo/publicRouteInventory.json');
  if (inventory.schemaVersion !== 1) {
    throw new Error(`[public-seo] Unsupported public route inventory version: ${inventory.schemaVersion}`);
  }
  const registry = readJson(root, 'config/public-seo-pages.json');
  if (registry.schemaVersion !== 1 || !registry.pages || typeof registry.pages !== 'object') {
    throw new Error(`[public-seo] Unsupported public SEO registry version: ${registry.schemaVersion}`);
  }
  const siteUrl = inventory.canonicalOrigin;
  const seoPages = new Map(Object.entries(registry.pages).map(([pathname, page]) => {
    const normalizedPathname = pathname.replace(/\/+$/, '') || '/';
    if (!pathname.startsWith('/') || pathname !== normalizedPathname || /[?#]/.test(pathname)
      || !page || typeof page.policyRouteId !== 'string' || !page.policyRouteId.trim()
      || typeof page.title !== 'string' || page.title.trim().length < 10
      || typeof page.description !== 'string' || page.description.trim().length < 40
      || typeof page.sitemap !== 'boolean') {
      throw new Error(`[public-seo] Invalid public SEO page: ${pathname}`);
    }
    return [pathname, page];
  }));

  function resolvePathPolicy(pathname) {
    const normalizedPathname = normalizePathname(pathname);
    const route = inventory.routes.find(candidate => routeMatchesPath(candidate, normalizedPathname));
    if (!route) throw new Error(`[public-seo] No public URL policy for ${normalizedPathname}`);
    return { ...route, normalizedPathname };
  }

  function canonicalUrlFor(pathname, policy) {
    if (policy.canonicalPolicy === 'none') return null;
    const path = normalizePathname(pathname);
    const canonicalPath = path === '/' || inventory.canonicalTrailingSlash !== 'always'
      ? path
      : `${path}/`;
    return `${siteUrl}${canonicalPath}`;
  }

  function staticSitemapXml() {
    const urls = [...seoPages.entries()]
      .filter(([, page]) => page.sitemap)
      .map(([pathname]) => {
        const canonical = canonicalUrlFor(pathname, resolvePathPolicy(pathname));
        if (!canonical) throw new Error(`[public-seo] Sitemap page has no canonical URL: ${pathname}`);
        return `  <url><loc>${escapeXml(canonical)}</loc></url>`;
      });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  }

  /**
   * Fingerprint of the content of each static page, by canonical URL: a hash of
   * its registry record and of its text sources. It depends on nothing else, so
   * a rebuild of the same content gives the same fingerprints; the server stores
   * the day it first saw each one and dates `lastmod` by it.
   */
  function staticPageFingerprints() {
    const fingerprints = {};
    for (const [pathname, page] of seoPages.entries()) {
      if (!page.sitemap) continue;
      const canonical = canonicalUrlFor(pathname, resolvePathPolicy(pathname));
      const sources = (PAGE_CONTENT_SOURCES[pathname] ?? []).flatMap(directory => contentFiles(root, directory));
      const hash = createHash('sha256').update(JSON.stringify({
        record: [page.policyRouteId, page.title, page.description, page.dataTitle ?? null, page.dataDescription ?? null],
        sources: sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]),
      })).digest('hex');
      fingerprints[canonical] = hash;
    }
    return fingerprints;
  }

  // Express serves the live index; this artifact documents the same segments.
  function sitemapIndexXml() {
    const locations = [
      `${siteUrl}/sitemaps/static.xml`,
      `${siteUrl}/sitemaps/standard-cards.xml`,
      `${siteUrl}/sitemaps/wild-cards.xml`,
      `${siteUrl}/sitemaps/battleground-minions.xml`,
      `${siteUrl}/sitemaps/battleground-spells.xml`,
      `${siteUrl}/sitemaps/battleground-heroes.xml`,
      `${siteUrl}/sitemaps/cosmetics.xml`,
      `${siteUrl}/sitemaps/guides-archive.xml`,
      `${siteUrl}/sitemaps/archetypes.xml`,
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map(location => `  <sitemap><loc>${escapeXml(location)}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
  }

  return { seoPages, staticSitemapXml, sitemapIndexXml, staticPageFingerprints };
}

/** Content files under a directory, as sorted paths relative to the root. */
function contentFiles(root, directory) {
  // A tree that has none of the page sources (a build fixture) has no text to track.
  if (!existsSync(resolve(root, directory))) return [];
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return contentFiles(root, path);
    return CONTENT_FILE.test(entry.name) && !NOT_CONTENT_FILE.test(entry.name) ? [path] : [];
  }).sort();
}

function normalizePathname(pathname) {
  const withoutQuery = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const absolute = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return absolute.replace(/\/+$/, '') || '/';
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function routeMatchesPath(route, pathname) {
  if (route.kind === 'fallback') return true;
  const templateParts = route.pattern === '/' ? [] : route.pattern.slice(1).split('/');
  const pathParts = pathname === '/' ? [] : pathname.slice(1).split('/');
  const catchAll = templateParts.at(-1)?.endsWith('*') ?? false;
  if ((!catchAll && templateParts.length !== pathParts.length)
    || (catchAll && pathParts.length < templateParts.length - 1)) return false;

  return templateParts.every((templatePart, index) => {
    if (!templatePart.startsWith(':')) return templatePart === pathParts[index];
    if (templatePart.endsWith('*')) return true;
    let value;
    try {
      value = decodeURIComponent(pathParts[index] || '');
    } catch {
      return false;
    }
    if (!value) return false;
    const constraint = route.pathParameters?.[templatePart.slice(1)];
    if (constraint?.allowedValues && !constraint.allowedValues.includes(value)) return false;
    if (constraint?.pattern && !new RegExp(constraint.pattern).test(value)) return false;
    return true;
  });
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
