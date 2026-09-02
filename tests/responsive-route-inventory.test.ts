import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type PublicRoute = {
  id: string;
  pattern: string;
  kind: string;
  owner: string;
  htmlStrategy: string;
  criticality: 'P0' | 'P1' | 'P2';
  mobileFixture: string;
  entitlement: string | null;
  pathParameters?: Record<string, {
    allowedValues?: string[];
    pattern?: string;
  }>;
};

type PublicInventory = {
  requiredViewports: number[];
  routes: PublicRoute[];
};

type ResponsiveProfile = {
  id: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
};

type ResponsiveFixture = {
  id: string;
  routeId: string;
  path: string;
  access: 'anonymous' | 'subscriber' | 'admin';
  state: 'content' | 'paywall' | 'denied' | 'not-found';
  transport?: 'preview' | 'nginx-html';
  ready: { selector: string; text?: string };
  capture: { mode: 'viewport'; anchor: 'top' };
  checks: Array<'overflow' | 'runtime-errors' | 'axe' | 'targets'>;
  representative: boolean;
};

type ResponsiveInventory = {
  schemaVersion: number;
  profiles: ResponsiveProfile[];
  defaultProfiles: string[];
  touchTargetRatchets: {
    'all-p0': {
      total: number;
      profiles: Record<string, number>;
    };
  };
  fixtures: ResponsiveFixture[];
};

const publicInventory = JSON.parse(readFileSync(
  new URL('../config/public-route-inventory.json', import.meta.url),
  'utf8',
)) as PublicInventory;
const responsiveInventory = JSON.parse(readFileSync(
  new URL('../config/responsive-route-fixtures.json', import.meta.url),
  'utf8',
)) as ResponsiveInventory;

assert.equal(responsiveInventory.schemaVersion, 2);

const expectedProfiles = [
  { id: 'compact-min', width: 320, height: 568 },
  { id: 'phone-baseline', width: 390, height: 844 },
  { id: 'medium', width: 768, height: 1024 },
];
assert.deepEqual(
  responsiveInventory.profiles.map(({ id, width, height }) => ({ id, width, height })),
  expectedProfiles,
  'responsive QA must keep the approved 320/390/768 baseline',
);
assert.deepEqual(
  responsiveInventory.defaultProfiles,
  expectedProfiles.map(profile => profile.id),
  'the default screenshot matrix must cover every baseline profile',
);

const profileIds = responsiveInventory.profiles.map(profile => profile.id);
assert.equal(new Set(profileIds).size, profileIds.length, 'responsive profile ids must be unique');
for (const profile of responsiveInventory.profiles) {
  assert.ok(publicInventory.requiredViewports.includes(profile.width), `${profile.id} must use a required public viewport`);
  assert.equal(profile.deviceScaleFactor, 2, `${profile.id} must use the deterministic DPR 2 baseline`);
  assert.equal(profile.isMobile, true, `${profile.id} must exercise compact/touch media behavior`);
  assert.equal(profile.hasTouch, true, `${profile.id} must exercise touch interactions`);
}
for (const profileId of responsiveInventory.defaultProfiles) {
  assert.ok(profileIds.includes(profileId), `default profile ${profileId} must exist`);
}

const allP0TouchRatchet = responsiveInventory.touchTargetRatchets['all-p0'];
assert.deepEqual(
  Object.keys(allP0TouchRatchet.profiles).sort(),
  [...responsiveInventory.defaultProfiles].sort(),
  'the all-P0 touch ratchet must cover every baseline profile',
);
for (const [profileId, maximum] of Object.entries(allP0TouchRatchet.profiles)) {
  assert.ok(Number.isInteger(maximum) && maximum >= 0, `${profileId} touch ratchet must be a non-negative integer`);
}
assert.equal(
  allP0TouchRatchet.total,
  Object.values(allP0TouchRatchet.profiles).reduce((sum, maximum) => sum + maximum, 0),
  'the all-P0 aggregate touch ratchet must equal its per-profile limits',
);

const routesById = new Map(publicInventory.routes.map(route => [route.id, route]));
const fixtureIds = responsiveInventory.fixtures.map(fixture => fixture.id);
assert.equal(new Set(fixtureIds).size, fixtureIds.length, 'responsive fixture ids must be unique');
const allowedAccess = new Set(['anonymous', 'subscriber', 'admin']);
const allowedStates = new Set(['content', 'paywall', 'denied', 'not-found']);

function routeMatchesPath(route: PublicRoute, rawPath: string): boolean {
  const pathname = new URL(rawPath, 'https://arena.hs-manacost.ru').pathname.replace(/\/$/, '') || '/';
  if (route.kind === 'fallback') {
    return !publicInventory.routes.some(candidate => candidate.kind !== 'fallback' && routeMatchesPath(candidate, rawPath));
  }
  const templateParts = route.pattern === '/' ? [] : route.pattern.slice(1).split('/');
  const pathParts = pathname === '/' ? [] : pathname.slice(1).split('/');
  const catchAll = templateParts.at(-1)?.endsWith('*') ?? false;
  if ((!catchAll && templateParts.length !== pathParts.length)
    || (catchAll && pathParts.length < templateParts.length - 1)) return false;

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

const allowedChecks = new Set(['overflow', 'runtime-errors', 'axe', 'targets']);
const requiredChecks = ['overflow', 'runtime-errors', 'axe', 'targets'];
for (const fixture of responsiveInventory.fixtures) {
  const route = routesById.get(fixture.routeId);
  assert.ok(route, `${fixture.id} references unknown route ${fixture.routeId}`);
  assert.equal(route?.criticality, 'P0', `${fixture.id} must stay within the P0 screenshot matrix`);
  assert.ok(fixture.path.startsWith('/'), `${fixture.id} must use a same-origin absolute path`);
  assert.equal(fixture.path.includes('#'), false, `${fixture.id} must not encode a fragment-only UI state`);
  assert.ok(allowedAccess.has(fixture.access), `${fixture.id} has unknown access profile ${fixture.access}`);
  assert.ok(allowedStates.has(fixture.state), `${fixture.id} has unknown state ${fixture.state}`);
  assert.equal(typeof fixture.representative, 'boolean', `${fixture.id} must declare representative coverage explicitly`);
  assert.ok(routeMatchesPath(route!, fixture.path), `${fixture.id} path must satisfy ${route?.pattern}`);
  assert.ok(fixture.ready.selector.trim(), `${fixture.id} must declare a readiness selector`);
  if (fixture.ready.text !== undefined) assert.ok(fixture.ready.text.trim(), `${fixture.id} readiness text must not be empty`);
  assert.deepEqual(fixture.capture, { mode: 'viewport', anchor: 'top' }, `${fixture.id} capture contract changed`);
  assert.equal(new Set(fixture.checks).size, fixture.checks.length, `${fixture.id} checks must be unique`);
  for (const check of fixture.checks) assert.ok(allowedChecks.has(check), `${fixture.id} has unknown check ${check}`);
  for (const check of requiredChecks) assert.ok(fixture.checks.includes(check as ResponsiveFixture['checks'][number]), `${fixture.id} must run ${check}`);

  const transport = fixture.transport ?? 'preview';
  if (route?.kind === 'fallback') {
    assert.equal(transport, 'nginx-html', `${fixture.id} must exercise the real nginx 404 transport`);
    assert.equal(fixture.state, 'not-found', `${fixture.id} fallback state must be not-found`);
  } else {
    assert.equal(transport, 'preview', `${fixture.id} must use deterministic preview fixtures`);
  }
  if (fixture.state === 'paywall') {
    assert.ok(route?.entitlement, `${fixture.id} must not invent a paywall for a public route`);
    assert.equal(fixture.access, 'anonymous', `${fixture.id} paywall state must use an anonymous session`);
  }
  if (fixture.state === 'content' && route?.entitlement) {
    if (fixture.access === 'anonymous') {
      assert.equal(route.htmlStrategy, 'prerender-teaser', `${fixture.id} anonymous content must be an explicit teaser route`);
      assert.equal(route.mobileFixture, fixture.id, `${fixture.id} anonymous teaser content must be the route's primary fixture`);
    } else {
      assert.ok(['subscriber', 'admin'].includes(fixture.access), `${fixture.id} gated content must use an entitled session`);
    }
  }
  if (fixture.state === 'denied') {
    assert.equal(route?.id, 'admin-panel', `${fixture.id} denied state is reserved for the admin route`);
    assert.equal(fixture.access, 'anonymous', `${fixture.id} denied state must use an anonymous session`);
  }
  if (fixture.state === 'not-found') {
    assert.equal(route?.kind, 'fallback', `${fixture.id} not-found state must use the fallback route`);
    assert.equal(fixture.access, 'anonymous', `${fixture.id} not-found state must use an anonymous session`);
  }
  if (fixture.access === 'admin') {
    assert.equal(route?.id, 'admin-panel', `${fixture.id} admin session is reserved for admin fixtures`);
    assert.equal(fixture.state, 'content', `${fixture.id} admin session must capture content`);
  }
  if (route?.id === 'admin-panel' && fixture.state === 'content') {
    assert.equal(fixture.access, 'admin', `${fixture.id} admin content must use an admin session`);
  }
}

const p0Routes = publicInventory.routes.filter(route => route.criticality === 'P0');
for (const route of p0Routes) {
  const primary = responsiveInventory.fixtures.find(fixture => fixture.id === route.mobileFixture);
  assert.ok(primary, `${route.id} must resolve its primary mobile fixture ${route.mobileFixture}`);
  assert.equal(primary?.routeId, route.id, `${route.mobileFixture} must belong to ${route.id}`);

  if (route.entitlement) {
    const routeFixtures = responsiveInventory.fixtures.filter(fixture => fixture.routeId === route.id);
    assert.ok(
      routeFixtures.some(fixture => fixture.access === 'anonymous' && ['paywall', 'content'].includes(fixture.state)),
      `${route.id} must cover its anonymous paywall or teaser state`,
    );
    assert.ok(
      routeFixtures.some(fixture => fixture.access === 'subscriber' && fixture.state === 'content'),
      `${route.id} must cover its entitled content state`,
    );
  }
}

const p0Owners = new Set(p0Routes.map(route => route.owner));
const representativeOwners = new Set(
  responsiveInventory.fixtures
    .filter(fixture => fixture.representative)
    .map(fixture => routesById.get(fixture.routeId)?.owner),
);
for (const owner of p0Owners) {
  assert.ok(representativeOwners.has(owner), `${owner} must have a representative PR fixture`);
}

for (const fixtureId of [
  'home',
  'articles',
  'standard-cards',
  'standard-card-detail',
  'standard-meta-anonymous',
  'standard-meta-subscriber',
  'arena-tierlist-subscriber',
  'bg-library-detail',
  'admin-denied',
  'admin-parser-admin',
]) {
  assert.equal(
    responsiveInventory.fixtures.find(fixture => fixture.id === fixtureId)?.representative,
    true,
    `${fixtureId} must remain in the representative PR matrix`,
  );
}

const constructedArchetypesAnonymous = responsiveInventory.fixtures.find(
  fixture => fixture.id === 'constructed-archetypes-anonymous',
);
assert.equal(
  constructedArchetypesAnonymous?.state,
  'content',
  'the anonymous archetype catalog is a public teaser surface, not a locked page',
);
assert.equal(
  constructedArchetypesAnonymous?.ready.selector,
  '.archetypes-ledger',
  'the anonymous archetype catalog must wait for rendered teaser data',
);

console.log(`responsive route inventory assertions passed (${responsiveInventory.fixtures.length} fixtures × ${responsiveInventory.profiles.length} profiles)`);
