import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABS } from '../src/routes';

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
  }>;
};

type Inventory = {
  schemaVersion: number;
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
  new URL('../config/public-route-inventory.json', import.meta.url),
  'utf8',
)) as Inventory;

assert.equal(inventory.schemaVersion, 1);
assert.equal(inventory.canonicalOrigin, 'https://arena.hs-manacost.ru');
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
  assert.equal(policy.pattern, route.slug, `${route.id} path must match the navigation registry`);
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
    assert.ok(Boolean(constraint?.allowedValues?.length || constraint?.pattern), `${route.id} :${parameter} constraint must not be empty`);
    if (constraint?.allowedValues) {
      assert.equal(new Set(constraint.allowedValues).size, constraint.allowedValues.length,
        `${route.id} :${parameter} allowed values must be unique`);
    }
    if (constraint?.pattern) assert.doesNotThrow(() => new RegExp(constraint.pattern));
  }
}

for (const requiredPattern of [
  '/guides-archive/:guideSlug',
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
assert.equal(
  byId.get('standard-card-detail')?.pathParameters?.cardId?.pattern,
  '^[A-Za-z0-9_]{2,80}$',
  'constructed card detail IDs must use the same bounded public resolver contract',
);
assert.equal(byId.get('bg-hero-detail')?.pathParameters?.dbfId?.pattern, '^[1-9][0-9]*$',
  'hero detail dbfId must be a positive integer');
assert.deepEqual(
  byId.get('bg-library-kind')?.pathParameters?.kind?.allowedValues,
  ['minions', 'spells', 'anomalies', 'quests', 'rewards', 'darkmoon-prizes', 'trinkets', 'timewarped'],
  'BG library kinds must be enumerated rather than accepted as arbitrary paths',
);
const unknownRoute = byId.get('unknown-path');
assert.equal(unknownRoute?.kind, 'fallback');
assert.equal(unknownRoute?.expectedStatus, 404);
assert.equal(unknownRoute?.indexPolicy, 'noindex-nofollow');
assert.equal(inventory.routes.at(-1)?.id, 'unknown-path', 'catch-all policy must remain last');

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
    const value = decodeURIComponent(pathParts[index] || '');
    const constraint = route.pathParameters?.[parameter];
    if (constraint?.allowedValues && !constraint.allowedValues.includes(value)) return false;
    if (constraint?.pattern && !new RegExp(constraint.pattern).test(value)) return false;
    return Boolean(value);
  });
}

const prerenderSource = readFileSync(new URL('../scripts/prerender.js', import.meta.url), 'utf8');
const prerenderPaths = [...prerenderSource.matchAll(/^  '([^']+)': \{/gm)].map(match => match[1]);
for (const path of prerenderPaths) {
  const policy = inventory.routes.find(route => routeMatchesPath(route, path));
  assert.ok(policy, `${path} prerender must have an inventory policy`);
  assert.equal(policy.indexPolicy, 'index', `${path} prerender must be indexable`);
  assert.equal(policy.expectedStatus, 200, `${path} prerender must describe a successful HTML route`);
}
for (const route of inventory.routes.filter(route => route.htmlStrategy === 'prerender' || route.htmlStrategy === 'prerender-teaser')) {
  assert.ok(prerenderPaths.includes(route.pattern), `${route.id} must have a prerender page definition`);
}

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

console.log(`public route inventory assertions passed (${inventory.routes.length} templates)`);
