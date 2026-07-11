import assert from 'node:assert/strict';
import {
  BG_TAB_IDS,
  isKnownPath,
  PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS,
  tabFromPath,
  TABS,
} from '../src/routes';

assert.equal(new Set(TABS.map(route => route.id)).size, TABS.length, 'route ids must be unique');
assert.equal(new Set(TABS.map(route => route.slug)).size, TABS.length, 'route slugs must be unique');

for (const route of TABS) {
  assert.ok(route.meta.title.length > 10, `${route.id} must define a useful title`);
  assert.ok(route.meta.description.length > 40, `${route.id} must define a useful description`);
  assert.equal(tabFromPath(route.slug), route.id, `${route.slug} must resolve to ${route.id}`);
  assert.equal(isKnownPath(route.slug), true, `${route.slug} must be recognized`);
}

assert.equal(tabFromPath('/heroes/76521'), 'bg-heroes');
assert.equal(tabFromPath('/library/archive/minions'), 'bg-library');
assert.equal(tabFromPath('/battlegrounds/tier-list?list=spells'), 'bg-tier-list');
assert.equal(tabFromPath('/decks/legacy'), 'home');
assert.equal(isKnownPath('/decks/legacy'), true);
assert.equal(isKnownPath('/definitely-unknown'), false);

for (const id of BG_TAB_IDS) {
  assert.equal(PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS[id], 'battlegrounds', `${id} must require the battlegrounds entitlement`);
}

console.log(`route registry assertions passed (${TABS.length} routes)`);
