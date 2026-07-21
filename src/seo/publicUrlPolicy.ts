export type PublicIndexPolicy = 'index' | 'noindex-follow' | 'noindex-nofollow';
export type PublicCanonicalPolicy = 'self' | 'clean-path' | 'none';

type PathParameterConstraint = {
  allowedValues?: string[];
  pattern?: string;
};

type PublicRoutePolicy = {
  id: string;
  pattern: string;
  kind: 'static' | 'listing' | 'detail' | 'redirect' | 'legacy' | 'fallback';
  indexPolicy: PublicIndexPolicy;
  canonicalPolicy: PublicCanonicalPolicy;
  pathParameters?: Record<string, PathParameterConstraint>;
};

type PublicQueryPolicy = {
  parameters: string[];
  indexPolicy: PublicIndexPolicy;
  canonicalPolicy: PublicCanonicalPolicy;
  appliesTo: string[];
};

type PublicRouteInventory = {
  schemaVersion: 1;
  canonicalOrigin: string;
  canonicalTrailingSlash: 'always';
  routes: PublicRoutePolicy[];
  queryPolicies: PublicQueryPolicy[];
};

export type ResolvedPublicUrlPolicy = {
  routeId: string;
  routeKind: PublicRoutePolicy['kind'];
  routePattern: string;
  known: boolean;
  indexPolicy: PublicIndexPolicy;
  robots: string;
  canonicalUrl: string | null;
  normalizedPathname: string;
};

export type DocumentPageMeta = {
  title: string;
  description: string;
  pathname: string;
  search?: string;
  image?: string | null;
};

const DEFAULT_ORIGIN = 'https://arena.hs-manacost.ru';
const DEFAULT_OG_IMAGE_URL = `${DEFAULT_ORIGIN}/assets/og-preview.png`;
let inventoryPromise: Promise<PublicRouteInventory> | null = null;
let documentMetaRevision = 0;

function loadInventory(): Promise<PublicRouteInventory> {
  inventoryPromise ??= import('../../config/public-route-inventory.json')
    .then(module => {
      const inventory = module.default as PublicRouteInventory;
      if (inventory.schemaVersion !== 1) {
        throw new Error(`Unsupported public route inventory version: ${inventory.schemaVersion}`);
      }
      return inventory;
    });
  return inventoryPromise;
}

export function normalizePublicPathname(pathname: string): string {
  const withoutQuery = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const absolute = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return absolute.replace(/\/+$/, '') || '/';
}

function decodePathPart(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function routeMatchesPath(route: PublicRoutePolicy, pathname: string): boolean {
  if (route.kind === 'fallback') return true;
  const templateParts = route.pattern === '/' ? [] : route.pattern.slice(1).split('/');
  const pathParts = pathname === '/' ? [] : pathname.slice(1).split('/');
  const catchAll = templateParts.at(-1)?.endsWith('*') ?? false;
  if ((!catchAll && templateParts.length !== pathParts.length)
    || (catchAll && pathParts.length < templateParts.length - 1)) return false;

  return templateParts.every((templatePart, index) => {
    if (!templatePart.startsWith(':')) return templatePart === pathParts[index];
    if (templatePart.endsWith('*')) return true;
    const parameter = templatePart.slice(1);
    const value = decodePathPart(pathParts[index] || '');
    if (!value) return false;
    const constraint = route.pathParameters?.[parameter];
    if (constraint?.allowedValues && !constraint.allowedValues.includes(value)) return false;
    if (constraint?.pattern && !new RegExp(constraint.pattern).test(value)) return false;
    return true;
  });
}

function robotsContent(indexPolicy: PublicIndexPolicy): string {
  if (indexPolicy === 'noindex-nofollow') return 'noindex, nofollow';
  if (indexPolicy === 'noindex-follow') return 'noindex, follow';
  return 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
}

function indexPolicyWeight(indexPolicy: PublicIndexPolicy): number {
  if (indexPolicy === 'noindex-nofollow') return 2;
  if (indexPolicy === 'noindex-follow') return 1;
  return 0;
}

function canonicalPath(pathname: string, trailingSlashPolicy: PublicRouteInventory['canonicalTrailingSlash']): string {
  if (pathname === '/') return '/';
  return trailingSlashPolicy === 'always' ? `${pathname}/` : pathname;
}

export async function resolvePublicUrlPolicy(
  pathname: string,
  search = '',
): Promise<ResolvedPublicUrlPolicy> {
  const inventory = await loadInventory();
  const normalizedPathname = normalizePublicPathname(pathname);
  const route = inventory.routes.find(candidate => routeMatchesPath(candidate, normalizedPathname))
    ?? inventory.routes[inventory.routes.length - 1];
  const parameters = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const queryPolicy = inventory.queryPolicies
    .filter(policy => policy.appliesTo.includes(route.pattern)
      && policy.parameters.some(parameter => parameters.has(parameter)))
    .sort((left, right) => indexPolicyWeight(right.indexPolicy) - indexPolicyWeight(left.indexPolicy))[0];
  const indexPolicy = queryPolicy && indexPolicyWeight(queryPolicy.indexPolicy) > indexPolicyWeight(route.indexPolicy)
    ? queryPolicy.indexPolicy
    : route.indexPolicy;
  const canonicalPolicy = route.canonicalPolicy === 'none'
    ? 'none'
    : queryPolicy?.canonicalPolicy ?? route.canonicalPolicy;
  const canonicalUrl = canonicalPolicy === 'none'
    ? null
    : `${inventory.canonicalOrigin}${canonicalPath(normalizedPathname, inventory.canonicalTrailingSlash)}`;

  return {
    routeId: route.id,
    routeKind: route.kind,
    routePattern: route.pattern,
    known: route.kind !== 'fallback',
    indexPolicy,
    robots: robotsContent(indexPolicy),
    canonicalUrl,
    normalizedPathname,
  };
}

function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertCanonical(href: string | null): void {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    existing?.remove();
    return;
  }
  const canonical = existing ?? document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = href;
  if (!existing) document.head.appendChild(canonical);
}

function absoluteImageUrl(image: string | null | undefined, baseUrl: string | null): string {
  if (!image) return DEFAULT_OG_IMAGE_URL;
  try {
    const parsed = new URL(image, baseUrl ?? `${DEFAULT_ORIGIN}/`);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : DEFAULT_OG_IMAGE_URL;
  } catch {
    return DEFAULT_OG_IMAGE_URL;
  }
}

export async function applyDocumentPageMeta(meta: DocumentPageMeta): Promise<ResolvedPublicUrlPolicy> {
  const revision = ++documentMetaRevision;
  const policy = await resolvePublicUrlPolicy(meta.pathname, meta.search);
  if (revision !== documentMetaRevision || typeof document === 'undefined') return policy;

  if (typeof window !== 'undefined') {
    const currentPath = normalizePublicPathname(window.location.pathname);
    const expectedPath = normalizePublicPathname(meta.pathname);
    const expectedSearch = meta.search ?? '';
    if (currentPath !== expectedPath || window.location.search !== expectedSearch) return policy;
  }

  const title = policy.known ? meta.title : 'Страница не найдена | Manacost Stats';
  const description = policy.known ? meta.description : 'Запрошенная страница не найдена.';
  document.title = title;
  upsertMeta('meta[name="description"]', 'name', 'description', description);
  upsertMeta('meta[name="robots"]', 'name', 'robots', policy.robots);
  upsertMeta('meta[property="og:title"]', 'property', 'og:title', title);
  upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
  upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
  upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
  upsertCanonical(policy.canonicalUrl);

  document.querySelectorAll<HTMLScriptElement>('script[data-server-entity-jsonld]')
    .forEach(element => {
      if (element.dataset.entityPath !== policy.normalizedPathname) element.remove();
    });

  if (policy.indexPolicy !== 'index') {
    document.querySelectorAll('script[type="application/ld+json"]').forEach(element => element.remove());
  }

  const staleOgUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (policy.canonicalUrl) {
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', policy.canonicalUrl);
  } else {
    staleOgUrl?.remove();
  }

  const imageUrl = absoluteImageUrl(meta.image, policy.canonicalUrl);
  upsertMeta('meta[property="og:image"]', 'property', 'og:image', imageUrl);
  upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);
  return policy;
}
