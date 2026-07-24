import assert from 'node:assert/strict';
import {
  ADMIN_ONLY_TAB_IDS,
  BG_TAB_IDS,
  isKnownPath,
  PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS,
  tabFromPath,
  TABS,
  TOP_LEVEL_TABS,
} from '../src/routes';
import { seoPageForNavigationRoute } from '../src/seo/registry';

assert.equal(new Set(TABS.map(route => route.id)).size, TABS.length, 'route ids must be unique');
assert.equal(new Set(TABS.map(route => route.slug)).size, TABS.length, 'route slugs must be unique');

for (const route of TABS) {
  const seo = seoPageForNavigationRoute(route.id);
  assert.ok(seo.title.length > 10, `${route.id} must define a useful title`);
  assert.ok(seo.description.length > 40, `${route.id} must define a useful description`);
  assert.equal(tabFromPath(route.slug), route.id, `${route.slug} must resolve to ${route.id}`);
  assert.equal(isKnownPath(route.slug), true, `${route.slug} must be recognized`);
}

assert.equal(tabFromPath('/heroes/76521'), 'bg-heroes');
assert.equal(tabFromPath('/library/archive/minions'), 'bg-library');
assert.equal(tabFromPath('/battlegrounds/tier-list?list=spells'), 'bg-tier-list');
assert.equal(tabFromPath('/faq'), 'faq', 'FAQ must be available as a standalone public page');
assert.equal(isKnownPath('/faq'), true, 'FAQ route must be recognized');
assert.equal(TOP_LEVEL_TABS.map(route => String(route.id)).includes('faq'), false, 'FAQ must stay out of primary sidebar and drawer navigation');
assert.equal(tabFromPath('/decks/legacy'), 'home');
assert.equal(isKnownPath('/decks/legacy'), true);
assert.equal(isKnownPath('/definitely-unknown'), false);
assert.equal(tabFromPath('/articlesevil'), 'home', 'route prefixes without a segment boundary must not match');
assert.equal(isKnownPath('/articlesevil'), false, 'unknown lookalike paths must remain unknown');

for (const id of BG_TAB_IDS) {
  assert.equal(PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS[id], 'battlegrounds', `${id} must require the battlegrounds entitlement`);
}

assert.equal(ADMIN_ONLY_TAB_IDS.has('standard-meta'), false, 'Standard meta must be visible publicly after release');
assert.equal(ADMIN_ONLY_TAB_IDS.has('constructed-archetypes'), false, 'Constructed archetypes must be visible publicly after release');
assert.equal(ADMIN_ONLY_TAB_IDS.has('standard-vicious-gold'), false, 'Vicious Syndicate Gold must be visible publicly after release');
assert.equal(ADMIN_ONLY_TAB_IDS.has('standard-cards'), false, 'Constructed cards must be visible publicly after release');
assert.equal(ADMIN_ONLY_TAB_IDS.has('deck-builder'), true, 'Deck builder must stay administrator-only under Разное');
assert.equal(tabFromPath('/deck-builder'), 'deck-builder');
assert.equal(isKnownPath('/deck-builder'), true);
assert.equal(tabFromPath('/standard/meta/standard/legacy-slug'), 'constructed-archetypes', 'legacy archetype details must keep opening the catalog');
for (const id of ['standard-matchups', 'standard-meta', 'constructed-archetypes', 'standard-vicious-gold'] as const) {
  assert.equal(
    PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS[id],
    'standard',
    `${id} must require the Diamond standard entitlement`,
  );
}
assert.equal(
  PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS['standard-cards'],
  undefined,
  'the card catalog must remain public because only its statistics are gated',
);

console.log(`route registry assertions passed (${TABS.length} routes)`);
