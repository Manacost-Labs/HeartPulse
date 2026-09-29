import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * JSON-backed public URL and SEO policy shared by the static-root builder and
 * the legacy prerender. It must stay free of Vite and of `src/` TypeScript so
 * release tooling keeps working after the legacy frontend build is removed.
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
    return [pathname, {
      ...page,
      title: renderSeoTemplate(page.title.trim()),
      description: renderSeoTemplate(page.description.trim()),
    }];
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

  // Express serves the live index; this artifact documents the same segments.
  function sitemapIndexXml() {
    const locations = [
      `${siteUrl}/sitemaps/static.xml`,
      `${siteUrl}/sitemaps/standard-cards.xml`,
      `${siteUrl}/sitemaps/wild-cards.xml`,
      `${siteUrl}/sitemaps/battleground-minions.xml`,
      `${siteUrl}/sitemaps/battleground-spells.xml`,
      `${siteUrl}/sitemaps/battleground-heroes.xml`,
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map(location => `  <sitemap><loc>${escapeXml(location)}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
  }

  return {
    inventory, siteUrl, seoPages,
    normalizePathname, resolvePathPolicy, canonicalUrlFor,
    staticSitemapXml, sitemapIndexXml,
  };
}

function normalizePathname(pathname) {
  const withoutQuery = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const absolute = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return absolute.replace(/\/+$/, '') || '/';
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function renderSeoTemplate(value) {
  return String(value).replace(/\{([a-z]+)\}/g, (_match, token) => {
    if (token === 'year') return String(new Date().getUTCFullYear());
    throw new Error(`[public-seo] Unsupported SEO template token: {${token}}`);
  });
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
