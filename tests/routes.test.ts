import assert from 'node:assert/strict';
import {
  ADMIN_ONLY_TAB_IDS,
  ADMIN_TABS,
  ARENA_TABS,
  BG_BUILDER_TABS,
  BG_PRIMARY_TABS,
  BG_TAB_IDS,
  MISC_TABS,
  STANDARD_TABS,
  tabFromPath,
  TABS,
  TOP_LEVEL_TABS,
  type TabId,
} from '../src/app/routing/navigationRoutes';
import { seoPageForNavigationRoute } from '../src/seo/registry';

const EXPECTED_ROUTE_PATHS = [
  ['home', '/'],
  ['articles', '/articles'],
  ['faq', '/faq'],
  ['developer-api', '/developers/api'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
  ['gallery', '/gallery'],
  ['cosmetics', '/cosmetics'],
  ['guides-archive', '/guides-archive'],
  ['contests', '/contests'],
  ['standard-matchups', '/standard/matchups'],
  ['standard-meta', '/standard/meta'],
  ['fun-decks', '/standard/fun-decks'],
  ['constructed-archetypes', '/standard/archetypes'],
  ['standard-vicious-gold', '/standard/vicious-gold'],
  ['standard-cards', '/standard/cards'],
  ['winrates', '/classes'],
  ['tierlist', '/tierlist'],
  ['legendaries', '/legendaries'],
  ['bg-heroes', '/heroes'],
  ['bg-library', '/library'],
  ['bg-tier-list', '/battlegrounds/tier-list'],
  ['bg-strategies', '/battlegrounds/strategies'],
  ['bg-tier-builder', '/battlegrounds/tier-builder'],
  ['admin-panel', '/admin'],
] as const satisfies readonly (readonly [TabId, `/${string}`])[];

assert.deepEqual(TABS.map(route => [route.id, route.path]), EXPECTED_ROUTE_PATHS,
  'the navigation must retain every surface and its canonical path');
assert.equal(new Set(TABS.map(route => route.id)).size, TABS.length, 'route ids must be unique');
assert.equal(new Set(TABS.map(route => route.path)).size, TABS.length, 'route paths must be unique');
const entitlementOf = (id: TabId) => TABS.find(route => route.id === id)?.entitlement ?? null;

// Every surface except the home page and the footer links belongs to exactly one menu group.
const grouped = [TOP_LEVEL_TABS, STANDARD_TABS, ARENA_TABS, BG_PRIMARY_TABS, BG_BUILDER_TABS, MISC_TABS, ADMIN_TABS]
  .flatMap(group => group.map(route => route.id));
assert.deepEqual([...grouped].sort(),
  TABS.filter(route => !['home', 'footer'].includes(route.group) && route.id !== 'faq').map(route => route.id).sort());

for (const route of TABS) {
  const seo = seoPageForNavigationRoute(route.id);
  assert.ok(seo.title.length > 10, `${route.id} must define a useful title`);
  assert.ok(seo.description.length > 40, `${route.id} must define a useful description`);
  assert.equal(tabFromPath(route.path), route.id, `${route.path} must resolve to ${route.id}`);
}

assert.equal(tabFromPath('/heroes/76521'), 'bg-heroes');
assert.equal(tabFromPath('/library/archive/minions'), 'bg-library');
assert.equal(tabFromPath('/battlegrounds/tier-list?list=spells'), 'bg-tier-list');
assert.equal(tabFromPath('/faq'), 'faq', 'FAQ must be available as a standalone public page');
assert.equal(tabFromPath('/privacy'), 'privacy', 'privacy policy must be a standalone public page');
assert.equal(tabFromPath('/terms'), 'terms', 'terms of use must be a standalone public page');
assert.equal(TOP_LEVEL_TABS.map(route => String(route.id)).includes('faq'), false, 'FAQ must stay out of primary sidebar and drawer navigation');
assert.equal(tabFromPath('/decks/legacy'), 'home', 'a removed page highlights no section');
assert.equal(tabFromPath('/connect'), 'home');
assert.equal(tabFromPath('/definitely-unknown'), 'home');
assert.equal(tabFromPath('/articlesevil'), 'home', 'route prefixes without a segment boundary must not match');
assert.equal(tabFromPath('/articles/guide/?utm=1#top'), 'articles', 'query and fragment do not change the section');

assert.deepEqual([...BG_TAB_IDS].sort(), ['bg-heroes', 'bg-library', 'bg-strategies', 'bg-tier-builder', 'bg-tier-list']);
for (const id of BG_TAB_IDS) {
  assert.equal(entitlementOf(id), 'battlegrounds', `${id} must require the battlegrounds entitlement`);
}

assert.equal(ADMIN_ONLY_TAB_IDS.has('standard-meta'), false, 'Standard meta must be visible publicly after release');
assert.equal(ADMIN_ONLY_TAB_IDS.has('constructed-archetypes'), false, 'Constructed archetypes must be visible publicly after release');
assert.equal(ADMIN_ONLY_TAB_IDS.has('standard-vicious-gold'), false, 'Vicious Syndicate Gold must be visible publicly after release');
assert.equal(ADMIN_ONLY_TAB_IDS.has('standard-cards'), false, 'Constructed cards must be visible publicly after release');
assert.equal(ADMIN_ONLY_TAB_IDS.has('fun-decks'), false, 'Fun decks must stay visible publicly');
assert.equal(entitlementOf('fun-decks'), 'standard', 'Fun decks must expose a public Diamond teaser');
assert.equal(tabFromPath('/standard/fun-decks'), 'fun-decks');
assert.equal(tabFromPath('/deck-builder'), 'home', 'the administrator deck builder is not a navigation section');
assert.equal(tabFromPath('/archetypes'), 'home', 'the administrator archetype editor is not a navigation section');
assert.equal(tabFromPath('/arena/draft'), 'home');
assert.equal(tabFromPath('/standard/meta/standard/legacy-slug'), 'constructed-archetypes', 'legacy archetype details must keep opening the catalog');
for (const id of ['standard-matchups', 'standard-meta', 'fun-decks', 'constructed-archetypes', 'standard-vicious-gold'] as const) {
  assert.equal(entitlementOf(id), 'standard', `${id} must require the Diamond standard entitlement`);
}
assert.equal(entitlementOf('standard-cards'), null,
  'the card catalog must remain public because only its statistics are gated');

console.log(`route registry assertions passed (${TABS.length} routes)`);
