import assert from 'node:assert/strict';
import { applyDocumentPageMeta, resolvePublicUrlPolicy } from '../src/shared/seo/publicUrlPolicy';
import { tabFromPath } from '../src/app/routing/navigationRoutes';

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

for (const format of ['standard', 'wild']) {
  for (const segment of ['blizzard:12345', 'blizzard%3A12345', 'blizzard%3a12345']) {
    await expectPolicy(`/standard/cards/${format}/${segment}/`, {
      routeId: 'standard-card-detail', robots: INDEX_ROBOTS,
      canonicalUrl: `${ORIGIN}/standard/cards/${format}/blizzard%3A12345/`, known: true,
    });
  }
  for (const segment of ['blizzard%253A12345', 'blizzard%3A0', '%ZZ', 'blizzard%3A12%2F34']) {
    const policy = await resolvePublicUrlPolicy(`/standard/cards/${format}/${segment}/`);
    assert.notEqual(policy.routeId, 'standard-card-detail');
  }
}

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
await expectPolicy('/library/minions/%D1%81%D1%83%D1%89%D0%B5%D1%81%D1%82%D0%B2%D0%BE-123', {
  routeId: 'bg-library-detail',
  robots: INDEX_ROBOTS,
  canonicalUrl: `${ORIGIN}/library/minions/%D1%81%D1%83%D1%89%D0%B5%D1%81%D1%82%D0%B2%D0%BE-123/`,
});

for (const invalidPath of [
  '/articlesevil',
  '/heroes/not-a-number',
  '/standard/cards/classic/CATA_785',
  '/standard/cards/standard/bad-id!',
  '/standard/cards/standard/A',
  `/standard/cards/standard/${'A'.repeat(81)}`,
  '/id/01',
  '/id/2147483648',
  '/id/%31',
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

// Next renders each route's metadata and JSON-LD through React, which removes
// those nodes itself on navigation. A node taken out by this code makes that
// removal throw and the page falls into the global error screen, so the fakes
// of server-rendered nodes refuse to be removed.
const reactOwned = (what: string) => () => { throw new Error(`${what} belongs to React and must not be removed`); };
const nodes = new Map<string, any>();
const trackedNode = (selector: string, value: string) => {
  const node: any = {
    content: selector.startsWith('meta') ? value : '',
    href: selector.startsWith('link') ? value : '',
    rel: '',
    attributes: {} as Record<string, string>,
    setAttribute(name: string, attribute: string) { this.attributes[name] = attribute; },
    removeAttribute(name: 'href' | 'content') { this[name] = ''; },
    remove: reactOwned(selector),
  };
  nodes.set(selector, node);
  return node;
};
trackedNode('link[rel="canonical"]', `${ORIGIN}/articles/`);
trackedNode('meta[property="og:url"]', `${ORIGIN}/articles/`);
const jsonLd = (entityPath?: string) => ({ type: 'application/ld+json', dataset: entityPath ? { entityPath } : {}, remove: reactOwned('JSON-LD') });
const structuredDataNode = jsonLd();
const entityStructuredDataNode = jsonLd('/standard/cards/standard/CARD_1');
// Next writes entity paths with the trailing slash the site serves.
const ownStructuredDataNode = jsonLd('/articles/');
const scripts = [structuredDataNode, entityStructuredDataNode, ownStructuredDataNode];
const active = (node: { type: string }) => node.type === 'application/ld+json';
const fakeDocument: any = {
  title: '',
  head: {
    appendChild(node: any) {
      const selector = node.rel === 'canonical'
        ? 'link[rel="canonical"]'
        : node.attributes.name
          ? `meta[name="${node.attributes.name}"]`
          : `meta[property="${node.attributes.property}"]`;
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
      removeAttribute(name: 'href' | 'content') { this[name] = ''; },
    };
  },
  querySelector(selector: string) { return nodes.get(selector) ?? null; },
  querySelectorAll(selector: string) {
    if (selector.includes('[data-server-entity-jsonld]')) return scripts.filter(node => active(node) && node.dataset.entityPath);
    return selector === 'script[type="application/ld+json"]' ? scripts.filter(active) : [];
  },
};
Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { location: { pathname: '/articles/', search: '' } },
});
try {
  await applyDocumentPageMeta({
    title: 'Статьи',
    description: 'Описание статей',
    pathname: '/articles',
    search: '',
    image: 'javascript:alert(1)',
  });
  assert.equal(active(entityStructuredDataNode), false,
    'indexable SPA navigation must turn off JSON-LD belonging to the previous entity path');
  assert.equal(active(ownStructuredDataNode), true,
    'the JSON-LD of the current page stays on although its path ends with a slash');
  assert.equal(active(structuredDataNode), true,
    'indexable SPA navigation must not turn off unrelated structured data globally');
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
  assert.equal(fakeDocument.title, 'Страница не найдена | HearthPulse');
  assert.equal(nodes.get('meta[name="robots"]')?.content, 'noindex, nofollow');
  assert.equal(nodes.get('link[rel="canonical"]')?.href, '', 'unknown client route must clear the stale canonical');
  assert.equal(nodes.get('meta[property="og:url"]')?.content, '', 'unknown client route must clear the stale og:url');
  assert.deepEqual(scripts.filter(active), [], 'unknown client route must turn off stale JSON-LD');

  (globalThis.window as any).location.pathname = '/articles/';
  await applyDocumentPageMeta({ title: 'Статьи', description: 'Описание статей', pathname: '/articles', search: '' });
  assert.equal(nodes.get('link[rel="canonical"]')?.href, `${ORIGIN}/articles/`, 'a known route fills the cleared canonical again');
  assert.equal(nodes.get('meta[property="og:url"]')?.content, `${ORIGIN}/articles/`);
} finally {
  delete (globalThis as any).document;
  delete (globalThis as any).window;
}

console.log('public URL policy assertions passed');
