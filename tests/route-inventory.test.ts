import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABS } from '../src/app/routing/navigationRoutes';
import { resolvePublicUrlPolicy } from '../src/shared/seo/publicUrlPolicy';
import { INDEXABLE_ARCHETYPE_MIN_GAMES, isIndexableArchetype } from '../shared/constructedArchetypeIndexing';
import {
  INDEX_MIN_OWN_FACTS,
  INDEX_MIN_OWN_WORDS,
  INDEX_MIN_SAMPLE_GAMES,
  indexThresholdNotice,
  meetsContentThreshold,
  meetsSampleThreshold,
} from '../shared/seoIndexThreshold';
import { projectConstructedArchetypeSitemapCatalog } from '../server/entitySitemapProjections';

type InventoryRoute = {
  id: string;
  pattern: string;
  kind: 'static' | 'listing' | 'detail' | 'redirect' | 'legacy' | 'fallback';
  owner: string;
  indexPolicy: 'index' | 'noindex-follow' | 'noindex-nofollow';
  canonicalPolicy: 'self' | 'clean-path' | 'none';
  sitemap: boolean;
  htmlStrategy: string;
  expectedStatus: number;
  criticality: 'P0' | 'P1' | 'P2';
  mobileFixture: string;
  entitlement: string | null;
  pathParameters?: Record<string, {
    allowedValues?: string[];
    pattern?: string;
    integerRange?: { minimum: number; maximum: number };
  }>;
};

type Inventory = {
  schemaVersion: number;
  contractOwner: string;
  canonicalOrigin: string;
  canonicalTrailingSlash: string;
  requiredViewports: number[];
  routes: InventoryRoute[];
  queryPolicies: Array<{
    id: string;
    parameters: string[];
    indexPolicy: string;
    canonicalPolicy: string;
    appliesTo: string[];
  }>;
};

const inventory = JSON.parse(readFileSync(
  new URL('../src/shared/seo/publicRouteInventory.json', import.meta.url),
  'utf8',
)) as Inventory;

assert.equal(inventory.schemaVersion, 1);
assert.equal(inventory.canonicalOrigin, 'https://hearthpulse.net');
assert.equal(inventory.canonicalTrailingSlash, 'always');
assert.deepEqual(inventory.requiredViewports, [320, 390, 768, 1440]);

const ids = inventory.routes.map(route => route.id);
const patterns = inventory.routes.map(route => route.pattern);
assert.equal(new Set(ids).size, ids.length, 'inventory route ids must be unique');
assert.equal(new Set(patterns).size, patterns.length, 'inventory path patterns must be unique');

const byId = new Map(inventory.routes.map(route => [route.id, route]));
for (const route of TABS) {
  const policy = byId.get(route.id);
  assert.ok(policy, `${route.id} must be present in the public route inventory`);
  assert.equal(policy.pattern, route.path, `${route.id} path must match the navigation registry`);
  assert.equal(policy.entitlement, route.entitlement, `${route.id} entitlement must match the navigation registry`);
}

const allowedKinds = new Set(['static', 'listing', 'detail', 'redirect', 'legacy', 'fallback']);
const allowedIndexPolicies = new Set(['index', 'noindex-follow', 'noindex-nofollow']);
const allowedCanonicalPolicies = new Set(['self', 'clean-path', 'none']);
const allowedStatuses = new Set([200, 301, 302, 404, 410]);
for (const route of inventory.routes) {
  assert.ok(route.pattern.startsWith('/'), `${route.id} path must be absolute`);
  assert.ok(route.pattern === '/' || !route.pattern.endsWith('/'), `${route.id} templates must be normalized without a trailing slash`);
  assert.equal(route.pattern.includes('?'), false, `${route.id} must not put query state in a path template`);
  assert.ok(allowedKinds.has(route.kind), `${route.id} has an unknown kind`);
  assert.ok(allowedIndexPolicies.has(route.indexPolicy), `${route.id} has an unknown index policy`);
  assert.ok(allowedCanonicalPolicies.has(route.canonicalPolicy), `${route.id} has an unknown canonical policy`);
  assert.ok(allowedStatuses.has(route.expectedStatus), `${route.id} has an unsupported expected status`);
  assert.ok(route.owner.trim(), `${route.id} must have an owner`);
  assert.ok(route.htmlStrategy.trim(), `${route.id} must have an HTML strategy`);
  assert.ok(route.mobileFixture.trim(), `${route.id} must have a mobile fixture`);
  if (route.indexPolicy === 'index') {
    assert.equal(route.canonicalPolicy, 'self', `${route.id} must be self-canonical when indexable`);
    assert.equal(route.sitemap, true, `${route.id} must be eligible for sitemap generation`);
  } else {
    assert.equal(route.sitemap, false, `${route.id} noindex route must not enter a sitemap`);
  }

  const placeholders = [...route.pattern.matchAll(/:([A-Za-z][A-Za-z0-9]*)(\*)?/g)];
  for (const [, parameter, catchAll] of placeholders) {
    if (catchAll) continue;
    const constraint = route.pathParameters?.[parameter];
    assert.ok(constraint, `${route.id} must constrain :${parameter}`);
    assert.ok(Boolean(
      constraint?.allowedValues?.length
      || constraint?.pattern
      || constraint?.integerRange,
    ), `${route.id} :${parameter} constraint must not be empty`);
    if (constraint?.allowedValues) {
      assert.equal(new Set(constraint.allowedValues).size, constraint.allowedValues.length,
        `${route.id} :${parameter} allowed values must be unique`);
    }
    if (constraint?.pattern) assert.doesNotThrow(() => new RegExp(constraint.pattern));
    if (constraint?.integerRange) {
      assert.ok(Number.isSafeInteger(constraint.integerRange.minimum));
      assert.ok(Number.isSafeInteger(constraint.integerRange.maximum));
      assert.ok(constraint.integerRange.minimum <= constraint.integerRange.maximum);
    }
  }
}

for (const requiredPattern of [
  '/guides-archive/:guideSlug',
  '/standard/archetypes/:format/:archetypeSlug',
  '/standard/meta/:format/:archetypeSlug',
  '/standard/cards/:format/:cardId',
  '/heroes/:dbfId',
  '/library/archive',
  '/library/:kind/:slugAndDbfId',
  '/library/archive/:kind/:slugAndDbfId',
  '/r/:slug',
  '/:path*',
]) {
  assert.ok(patterns.includes(requiredPattern), `${requiredPattern} must have an explicit route policy`);
}

assert.deepEqual(
  byId.get('standard-cards-format')?.pathParameters?.format?.allowedValues,
  ['standard', 'wild'],
  'constructed card format must only accept standard and wild',
);
assert.deepEqual(
  byId.get('constructed-archetype-detail')?.pathParameters?.format?.allowedValues,
  ['standard', 'wild'],
  'archetype details must only accept standard and wild',
);
assert.equal(
  byId.get('constructed-archetype-detail')?.pathParameters?.archetypeSlug?.pattern,
  '^[a-z0-9][a-z0-9-]{0,119}$',
  'archetype detail slugs must use the parser-compatible bounded contract',
);
// E9 S3a/S3b: the archetype listing is indexable per page (the page narrows it to strong Standard archetypes);
// the old /standard/meta/<format>/<slug> family is one permanent redirect to it.
const archetypeDetail = byId.get('constructed-archetype-detail');
assert.deepEqual(
  [archetypeDetail?.indexPolicy, archetypeDetail?.canonicalPolicy, archetypeDetail?.sitemap, archetypeDetail?.htmlStrategy],
  ['index', 'self', true, 'server-ssr'],
  'archetype details are server-rendered and open to indexing page by page',
);
const legacyArchetypeDetail = byId.get('standard-meta-legacy-detail');
assert.deepEqual(
  [legacyArchetypeDetail?.kind, legacyArchetypeDetail?.expectedStatus, legacyArchetypeDetail?.indexPolicy,
    legacyArchetypeDetail?.canonicalPolicy, legacyArchetypeDetail?.sitemap],
  ['redirect', 301, 'noindex-follow', 'none', false],
  'the old archetype family is a permanent redirect that stays out of the index and of the sitemap',
);
const cardIdPattern = byId.get('standard-card-detail')?.pathParameters?.cardId?.pattern;
assert.ok(cardIdPattern, 'card detail inventory declares its bounded segment contract');
const cardIdMatcher = new RegExp(cardIdPattern);
for (const id of ['EX1_001', 'blizzard:12345', 'blizzard%3A12345', 'blizzard%3a12345']) {
  assert.ok(cardIdMatcher.test(id), `card detail inventory accepts ${id}`);
}
for (const id of ['A', 'blizzard:0', 'blizzard%253A12345', 'blizzard:12/34', 'A'.repeat(81)]) {
  assert.equal(cardIdMatcher.test(id), false, `card detail inventory rejects ${id}`);
}
assert.equal(byId.get('bg-hero-detail')?.pathParameters?.dbfId?.pattern, '^[1-9][0-9]*$',
  'hero detail dbfId must be a positive integer');
assert.deepEqual(
  byId.get('public-profile')?.pathParameters?.publicProfileId?.integerRange,
  { minimum: 1, maximum: 2_147_483_647 },
  'public profile SEO routes must share the server-issued numeric ID range',
);
assert.deepEqual(
  byId.get('bg-library-kind')?.pathParameters?.kind?.allowedValues,
  ['minions', 'spells', 'anomalies', 'dark-gifts', 'quests', 'rewards', 'darkmoon-prizes', 'trinkets', 'timewarped'],
  'BG library kinds must be enumerated rather than accepted as arbitrary paths',
);
const unknownRoute = byId.get('unknown-path');
assert.equal(unknownRoute?.kind, 'fallback');
assert.equal(unknownRoute?.expectedStatus, 404);
assert.equal(unknownRoute?.indexPolicy, 'noindex-nofollow');
assert.equal(inventory.routes.at(-1)?.id, 'unknown-path', 'catch-all policy must remain last');

assert.equal(byId.get('bg-library-detail')?.htmlStrategy, 'server-ssr',
  'base BG card details must use the authoritative server resolver');
assert.deepEqual(
  byId.get('bg-library-detail')?.pathParameters?.kind?.allowedValues,
  ['minions', 'spells'],
  'the authoritative BG card resolver must stay scoped to the two base catalogs',
);
assert.equal(byId.get('bg-library-additional-detail')?.htmlStrategy, 'snapshot',
  'additional BG object details must retain their existing shell strategy');
assert.deepEqual(
  byId.get('bg-library-additional-detail')?.pathParameters?.additionalKind?.allowedValues,
  ['anomalies', 'dark-gifts', 'quests', 'rewards', 'darkmoon-prizes', 'trinkets', 'timewarped'],
  'additional BG object kinds must remain explicit and disjoint from base catalogs',
);
assert.equal(byId.get('bg-library-archive-detail')?.htmlStrategy, 'snapshot',
  'archive BG details are outside the base SSR slice');

function routeMatchesPath(route: InventoryRoute, path: string): boolean {
  if (route.kind === 'fallback') return false;
  const templateParts = route.pattern === '/' ? [] : route.pattern.slice(1).split('/');
  const pathParts = path === '/' ? [] : path.replace(/^\//, '').replace(/\/$/, '').split('/');
  const catchAll = templateParts.at(-1)?.endsWith('*') ?? false;
  if ((!catchAll && templateParts.length !== pathParts.length) || (catchAll && pathParts.length < templateParts.length - 1)) return false;

  return templateParts.every((templatePart, index) => {
    if (!templatePart.startsWith(':')) return templatePart === pathParts[index];
    if (templatePart.endsWith('*')) return true;
    const parameter = templatePart.slice(1);
    const rawValue = pathParts[index] || '';
    const value = decodeURIComponent(rawValue);
    const constraint = route.pathParameters?.[parameter];
    if (constraint?.allowedValues
      && (!constraint.allowedValues.includes(rawValue) || !constraint.allowedValues.includes(value))) return false;
    if (constraint?.pattern) {
      const pattern = new RegExp(constraint.pattern);
      if (!pattern.test(rawValue) || !pattern.test(value)) return false;
    }
    if (constraint?.integerRange) {
      const rawParsed = Number(rawValue);
      const parsed = Number(value);
      if (!Number.isSafeInteger(rawParsed)
        || !Number.isSafeInteger(parsed)
        || rawParsed < constraint.integerRange.minimum
        || rawParsed > constraint.integerRange.maximum
        || parsed < constraint.integerRange.minimum
        || parsed > constraint.integerRange.maximum) return false;
    }
    return Boolean(value);
  });
}

// Pages with authored titles and descriptions live in the SEO registry.
const seoRegistry = JSON.parse(
  readFileSync(new URL('../config/public-seo-pages.json', import.meta.url), 'utf8'),
) as { pages: Record<string, { sitemap: boolean; title: string; description: string }> };
const indexedRegistryPaths = Object.entries(seoRegistry.pages)
  .filter(([, page]) => page.sitemap)
  .map(([path]) => path);
for (const path of indexedRegistryPaths) {
  const policy = inventory.routes.find(route => routeMatchesPath(route, path));
  assert.ok(policy, `${path} registry page must have an inventory policy`);
  assert.equal(policy.indexPolicy, 'index', `${path} registry page must be indexable`);
  assert.equal(policy.expectedStatus, 200, `${path} registry page must describe a successful HTML route`);
}
for (const route of inventory.routes.filter(route => route.htmlStrategy === 'prerender' || route.htmlStrategy === 'prerender-teaser')) {
  const registryPage = seoRegistry.pages[route.pattern];
  assert.ok(registryPage, `${route.id} must have an SEO registry page`);
  assert.equal(registryPage.sitemap, route.sitemap,
    `${route.id} registry page must be listed in the sitemap exactly when the inventory says so`);
}

// /articles is a collection of kolodahearthstone.com articles (owner decision
// 2026-11-15): crawlable for link discovery, never an index or sitemap entry.
const articlesRoute = inventory.routes.find(route => route.id === 'articles');
assert.deepEqual(
  [articlesRoute?.indexPolicy, articlesRoute?.sitemap, seoRegistry.pages['/articles']?.sitemap],
  ['noindex-follow', false, false],
  '/articles must be noindex, follow and absent from the sitemap',
);
assert.ok(!indexedRegistryPaths.includes('/articles'), '/articles must not be a sitemap page');
const articlesPage = seoRegistry.pages['/articles'];
assert.match(`${articlesPage.title} ${articlesPage.description}`, /подборка/i, '/articles must be called a collection');
assert.ok(articlesPage.description.split(/\s+/).map(word => word.replace(/[.,;:!?]+$/, '')).some(word => word === 'kolodahearthstone.com'),
  '/articles must say where the articles live');
const articlesNav = TABS.find(tab => tab.id === 'articles');
assert.equal(articlesNav?.label, 'Подборка', 'the menu calls /articles a collection');

// ?version=X patch pages (46 URLs with one title) canonicalise to the clean path.
const patchPolicy = await resolvePublicUrlPolicy('/standard/patches/', '?version=33.0.2');
assert.equal(patchPolicy.canonicalUrl, 'https://hearthpulse.net/standard/patches/',
  '/standard/patches/?version=X must be canonical to the path without the parameter');

const queryOwners = new Map<string, string>();
for (const policy of inventory.queryPolicies) {
  assert.ok(policy.parameters.length, `${policy.id} must own at least one query parameter`);
  assert.ok(policy.appliesTo.length, `${policy.id} must declare the affected route templates`);
  for (const path of policy.appliesTo) {
    assert.ok(patterns.includes(path), `${policy.id} references unknown route template ${path}`);
  }
  for (const parameter of policy.parameters) {
    assert.equal(queryOwners.has(parameter), false,
      `query parameter ${parameter} is owned by both ${queryOwners.get(parameter)} and ${policy.id}`);
    queryOwners.set(parameter, policy.id);
  }
}
for (const parameter of ['login', 'admin', 'section', 'contest', 'contests', 'page', 'list', 'source', 'strategy', 'q']) {
  assert.ok(queryOwners.has(parameter), `${parameter} query state must have an explicit noindex policy`);
}

// S5 (#379): one indexing rule. index <=> sitemap <=> self-canonical, and a noindex page is in no segment.
for (const route of inventory.routes) {
  assert.equal(route.indexPolicy === 'index', route.sitemap,
    `${route.id}: index and sitemap eligibility must be the same fact`);
  if (route.indexPolicy === 'index') {
    assert.equal(route.canonicalPolicy, 'self', `${route.id}: an index page is canonical to itself`);
    assert.equal(route.expectedStatus, 200, `${route.id}: an index page answers 200`);
  }
}

// Every entity sitemap segment lists paths that the inventory marks `index`; no segment carries a noindex template.
const segmentSamplePaths: Record<string, string> = {
  'standard-cards': '/standard/cards/standard/EX1_001/',
  'wild-cards': '/standard/cards/wild/EX1_001/',
  'battleground-minions': '/library/minions/murloc-tidehunter-1/',
  'battleground-spells': '/library/spells/banana-1/',
  'battleground-heroes': '/heroes/1/',
  cosmetics: '/cosmetics/heroes/57944/',
  'guides-archive': '/guides-archive/some-guide/',
  archetypes: '/standard/archetypes/standard/aggro-hunter/',
};
for (const [segment, path] of Object.entries(segmentSamplePaths)) {
  const policy = inventory.routes.find(route => routeMatchesPath(route, path));
  assert.ok(policy, `${segment} sitemap segment path ${path} must have an inventory policy`);
  assert.equal(policy.indexPolicy, 'index', `${segment} sitemap segment must not contain a noindex template (${policy.id})`);
  assert.equal(policy.sitemap, true, `${segment} sitemap segment template ${policy.id} must be sitemap-eligible`);
  assert.equal(policy.canonicalPolicy, 'self', `${segment} sitemap segment template ${policy.id} must be self-canonical`);
}

// Dynamic noindex: an archetype below the sample threshold is kept out of its segment, not silently listed.
const archetypeRow = (games: number) => ({
  item: { slug: 'aggro-hunter', format: 'standard', games, deckCount: 3, popularity: 2, archetype: 'Aggro', classKey: 'hunter' },
  updatedAt: '2026-11-19T00:00:00.000Z',
  period: 'last-7-days',
});
const archetypeMin = INDEX_MIN_SAMPLE_GAMES.archetype;
assert.equal(isIndexableArchetype(archetypeRow(archetypeMin).item as never), true);
assert.equal(isIndexableArchetype(archetypeRow(archetypeMin - 1).item as never), false);
assert.equal(projectConstructedArchetypeSitemapCatalog([archetypeRow(archetypeMin)]).length, 1,
  'an archetype at the threshold enters the archetypes segment');
assert.throws(() => projectConstructedArchetypeSitemapCatalog([archetypeRow(archetypeMin - 1)]),
  'an archetype below the threshold must be rejected from the archetypes segment');

// The threshold module: 150 own words or 10 own facts; the notice names the sample.
assert.equal(INDEX_MIN_OWN_WORDS, 150);
assert.equal(INDEX_MIN_OWN_FACTS, 10);
assert.equal(INDEXABLE_ARCHETYPE_MIN_GAMES, archetypeMin, 'the archetype readers see the number of the threshold module, not a second constant');
// One rule: the archetype predicate and the sitemap projection agree with the shared sample threshold at the boundary.
for (const games of [0, archetypeMin - 1, archetypeMin, archetypeMin + 1]) {
  const expected = meetsSampleThreshold(games, archetypeMin);
  assert.equal(isIndexableArchetype(archetypeRow(games).item as never), expected, `isIndexableArchetype at ${games} games`);
  const listed = (() => {
    try { return projectConstructedArchetypeSitemapCatalog([archetypeRow(games)]).length === 1; } catch { return false; }
  })();
  assert.equal(listed, expected, `sitemap projection at ${games} games`);
}
assert.equal(archetypeMin, 1000, 'the archetype sample minimum is the existing constant, read from the threshold module');
assert.equal(meetsContentThreshold({ ownWords: 149, ownFacts: 9 }), false);
assert.equal(meetsContentThreshold({ ownWords: 150, ownFacts: 0 }), true);
assert.equal(meetsContentThreshold({ ownWords: 0, ownFacts: 10 }), true);
assert.equal(meetsContentThreshold({ ownWords: Number.NaN, ownFacts: -3 }), false);
assert.equal(
  indexThresholdNotice({ games: 120, minGames: archetypeMin }),
  'Мало данных: 120 игр из нужных 1000, страница не индексируется до набора выборки',
);
assert.equal(
  indexThresholdNotice({ games: null, minGames: archetypeMin }),
  'Мало данных: 0 игр из нужных 1000, страница не индексируется до набора выборки',
);
assert.equal(indexThresholdNotice({ games: archetypeMin, minGames: archetypeMin }), null);
assert.equal(indexThresholdNotice({ games: archetypeMin + 5000, minGames: archetypeMin }), null);

console.log(`public route inventory assertions passed (${inventory.routes.length} templates)`);
