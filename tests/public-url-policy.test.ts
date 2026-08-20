import assert from 'node:assert/strict';
import { applyDocumentPageMeta, resolvePublicUrlPolicy } from '../src/seo/publicUrlPolicy';
import { tabFromPath } from '../src/routes';

const ORIGIN = 'https://hearthpulse.net';

async function expectPolicy(
  pathname: string,
  expected: {
    routeId: string;
    robots: string;
    canonicalUrl: string | null;
    known?: boolean;
  },
  search = '',
): Promise<void> {
  const actual = await resolvePublicUrlPolicy(pathname, search);
  assert.equal(actual.routeId, expected.routeId, `${pathname}${search} route`);
  assert.equal(actual.robots, expected.robots, `${pathname}${search} robots`);
  assert.equal(actual.canonicalUrl, expected.canonicalUrl, `${pathname}${search} canonical`);
  if (expected.known !== undefined) assert.equal(actual.known, expected.known, `${pathname}${search} known`);
}

const INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

await expectPolicy('/', {
  routeId: 'home',
  robots: INDEX_ROBOTS,
  canonicalUrl: `${ORIGIN}/`,
});
await expectPolicy('/tierlist', {
  routeId: 'tierlist',
  robots: INDEX_ROBOTS,
  canonicalUrl: `${ORIGIN}/tierlist/`,
});
await expectPolicy('/tierlist/', {
  routeId: 'tierlist',
  robots: INDEX_ROBOTS,
  canonicalUrl: `${ORIGIN}/tierlist/`,
});
await expectPolicy('/standard/cards/standard/CATA_785', {
  routeId: 'standard-card-detail',
  robots: INDEX_ROBOTS,
  canonicalUrl: `${ORIGIN}/standard/cards/standard/CATA_785/`,
});
await expectPolicy('/heroes/76521', {
  routeId: 'bg-hero-detail',
  robots: INDEX_ROBOTS,
  canonicalUrl: `${ORIGIN}/heroes/76521/`,
});
await expectPolicy('/library/minions/example-123', {
  routeId: 'bg-library-detail',
  robots: INDEX_ROBOTS,
  canonicalUrl: `${ORIGIN}/library/minions/example-123/`,
});

for (const invalidPath of [
  '/articlesevil',
  '/heroes/not-a-number',
  '/standard/cards/classic/CATA_785',
  '/standard/cards/standard/bad-id!',
  '/standard/cards/standard/A',
  `/standard/cards/standard/${'A'.repeat(81)}`,
]) {
  await expectPolicy(invalidPath, {
    routeId: 'unknown-path',
    robots: 'noindex, nofollow',
    canonicalUrl: null,
    known: false,
  });
}
assert.equal(tabFromPath('/articlesevil'), 'home', 'navigation matching must respect route boundaries');
assert.equal(tabFromPath('/articles/guide'), 'articles');

await expectPolicy('/admin', {
  routeId: 'admin-panel',
  robots: 'noindex, nofollow',
  canonicalUrl: null,
});
await expectPolicy('/admin', {
  routeId: 'admin-panel',
  robots: 'noindex, nofollow',
  canonicalUrl: null,
}, '?section=users');
await expectPolicy('/', {
  routeId: 'home',
  robots: 'noindex, nofollow',
  canonicalUrl: `${ORIGIN}/`,
}, '?login');
await expectPolicy('/', {
  routeId: 'home',
  robots: 'noindex, nofollow',
  canonicalUrl: `${ORIGIN}/`,
}, '?admin&section=users');
await expectPolicy('/standard/cards/standard', {
  routeId: 'standard-cards-format',
  robots: 'noindex, follow',
  canonicalUrl: `${ORIGIN}/standard/cards/standard/`,
}, '?sort=winrate');

const noindex = await resolvePublicUrlPolicy('/', '?login');
const indexableAgain = await resolvePublicUrlPolicy('/articles');
assert.equal(noindex.indexPolicy, 'noindex-nofollow');
assert.equal(indexableAgain.indexPolicy, 'index', 'policy resolution must not retain prior navigation state');

const nodes = new Map<string, any>();
const trackedNode = (selector: string) => {
  const node: any = {
    content: '',
    href: '',
    rel: '',
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string) { this.attributes[name] = value; },
    remove() { nodes.delete(selector); },
  };
  nodes.set(selector, node);
  return node;
};
trackedNode('link[rel="canonical"]');
trackedNode('meta[property="og:url"]');
let structuredDataRemoved = false;
const structuredDataNode = { remove: () => { structuredDataRemoved = true; } };
let entityStructuredDataRemoved = false;
const entityStructuredDataNode = {
  dataset: { entityPath: '/standard/cards/standard/CARD_1' },
  remove: () => { entityStructuredDataRemoved = true; },
};
const fakeDocument: any = {
  title: '',
  head: {
    appendChild(node: any) {
      const selector = node.rel === 'canonical'
        ? 'link[rel="canonical"]'
        : node.attributes.name
          ? `meta[name="${node.attributes.name}"]`
          : `meta[property="${node.attributes.property}"]`;
      node.remove = () => nodes.delete(selector);
      nodes.set(selector, node);
      return node;
    },
  },
  createElement() {
    return {
      content: '',
      href: '',
      rel: '',
      attributes: {} as Record<string, string>,
      setAttribute(name: string, value: string) { this.attributes[name] = value; },
      remove() {},
    };
  },
  querySelector(selector: string) { return nodes.get(selector) ?? null; },
  querySelectorAll(selector: string) {
    if (selector === 'script[data-server-entity-jsonld]' && !entityStructuredDataRemoved) {
      return [entityStructuredDataNode];
    }
    return selector === 'script[type="application/ld+json"]' && !structuredDataRemoved
      ? [structuredDataNode]
      : [];
  },
};
Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { location: { pathname: '/articles', search: '' } },
});
try {
  await applyDocumentPageMeta({
    title: 'Статьи',
    description: 'Описание статей',
    pathname: '/articles',
    search: '',
    image: 'javascript:alert(1)',
  });
  assert.equal(entityStructuredDataRemoved, true,
    'indexable SPA navigation must remove JSON-LD belonging to the previous entity path');
  assert.equal(structuredDataRemoved, false,
    'indexable SPA navigation must not remove unrelated structured data globally');
  assert.equal(
    nodes.get('meta[property="og:image"]')?.content,
    `${ORIGIN}/assets/og-preview.png`,
    'unsafe client image protocols must fall back to the public preview image',
  );
  assert.equal(nodes.get('meta[name="twitter:image"]')?.content, `${ORIGIN}/assets/og-preview.png`);

  (globalThis.window as any).location.pathname = '/articlesevil';
  await applyDocumentPageMeta({
    title: 'Статьи',
    description: 'Описание статей',
    pathname: '/articlesevil',
    search: '',
  });
  assert.equal(fakeDocument.title, 'Страница не найдена | Manacost Stats');
  assert.equal(nodes.get('meta[name="robots"]')?.content, 'noindex, nofollow');
  assert.equal(nodes.has('link[rel="canonical"]'), false, 'unknown client route must remove stale canonical');
  assert.equal(nodes.has('meta[property="og:url"]'), false, 'unknown client route must remove stale og:url');
  assert.equal(structuredDataRemoved, true, 'unknown client route must remove stale JSON-LD');
} finally {
  delete (globalThis as any).document;
  delete (globalThis as any).window;
}

console.log('public URL policy assertions passed');
