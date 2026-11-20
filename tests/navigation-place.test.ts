import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationPlace, pathOfMenuItem } from '../src/app/routing/navigationPlace.js';
import { NAVIGATION_MODES, WILD_NAVIGATION_ITEMS } from '../src/app/routing/navigationData.js';
import type { NavigationModeId } from '../src/app/routing/navigationData.js';

// [address, query (null = not known yet), remembered mode (null = not known), mode, highlighted item]
type Row = readonly [string, string | null, NavigationModeId | null, NavigationModeId | null, string];
const ROWS: readonly Row[] = [
  // Every address of the Wild list opens in Wild with its own item highlighted.
  ['/standard/meta/', '?format=wild', 'standard', 'wild', 'wild-meta'],
  ['/standard/matchups/', '?format=wild&rank=all', 'standard', 'wild', 'wild-matchups'],
  ['/standard/archetypes/', '?format=wild', 'standard', 'wild', 'wild-archetypes'],
  ['/standard/fun-decks/', '?format=wild&sort=reliable', 'arena', 'wild', 'wild-fun-decks'],
  ['/standard/cards/wild/', '', 'standard', 'wild', 'wild-cards'],
  ['/standard/deck-builder/', '?format=wild', 'standard', 'wild', 'wild-deck-builder'],
  // The same pages without the format are Standard, whatever the reader chose before.
  ['/standard/meta/', '', 'wild', 'standard', 'standard-meta'],
  ['/standard/meta/', '?format=standard', 'wild', 'standard', 'standard-meta'],
  ['/standard/meta/', '?rank=all', 'wild', 'standard', 'standard-meta'],
  ['/standard/matchups/', '', 'wild', 'standard', 'standard-matchups'],
  ['/standard/archetypes/', '', 'wild', 'standard', 'constructed-archetypes'],
  ['/standard/fun-decks/', '', 'wild', 'standard', 'fun-decks'],
  ['/standard/cards/', '', 'wild', 'standard', 'standard-cards'],
  ['/standard/deck-builder/', '?code=AAEBAQ', 'wild', 'standard', 'deck-builder'],
  // The format may sit in the path: the card catalog and the pages of one archetype.
  ['/standard/cards/wild', '', null, 'wild', 'wild-cards'],
  ['/standard/meta/wild/', '', 'standard', 'wild', 'wild-meta'],
  ['/standard/meta/wild', null, null, 'wild', 'wild-meta'],
  ['/standard/matchups/wild/', '', 'standard', 'wild', 'wild-matchups'],
  ['/standard/matchups/wild', null, null, 'wild', 'wild-matchups'],
  ['/standard/cards/wild/some-card', null, null, 'wild', 'wild-cards'],
  ['/standard/archetypes/wild/quest-mage', '', 'standard', 'wild', 'wild-archetypes'],
  ['/standard/meta/wild/quest-mage', '', 'standard', 'wild', 'wild-archetypes'],
  ['/standard/archetypes/standard/quest-mage', '', 'wild', 'standard', 'constructed-archetypes'],
  ['/standard/meta/standard/quest-mage', '', 'wild', 'standard', 'constructed-archetypes'],
  ['/standard/archetypes/standard/wild', '', 'standard', 'standard', 'constructed-archetypes'],
  ['/standard/archetypes/standard/quest-mage', '?format=wild', 'standard', 'standard', 'constructed-archetypes'],
  // A card page below the catalog, and the catalog with a format query, follow the same rule.
  ['/standard/cards/some-card/', '', 'standard', 'standard', 'standard-cards'],
  ['/standard/cards/', '?format=wild', 'standard', 'wild', 'wild-cards'],
  // Patch notes have no format: the reader's last Standard or Wild choice stays, Standard by default.
  ['/standard/patches/', '', 'wild', 'wild', 'wild-patch-notes'],
  ['/standard/patches/', '', 'standard', 'standard', 'patch-notes'],
  ['/standard/patches/', '', 'arena', 'standard', 'patch-notes'],
  ['/standard/patches/37-0-0/', '', 'wild', 'wild', 'wild-patch-notes'],
  // VS Gold has no Wild data: it is Standard whatever the query says.
  ['/standard/vicious-gold/', '', 'wild', 'standard', 'standard-vicious-gold'],
  ['/standard/vicious-gold/', '?format=wild', 'wild', 'standard', 'standard-vicious-gold'],
  // Other modes ignore the format and the remembered mode.
  ['/classes/', '?format=wild', 'wild', 'arena', 'winrates'],
  ['/tierlist/', '', 'wild', 'arena', 'tierlist'],
  ['/heroes/76521', '', 'wild', 'battlegrounds', 'bg-heroes'],
  ['/articles/', '', 'wild', 'community', 'articles'],
  // Pages outside every mode leave the choice alone.
  ['/', '', 'wild', null, 'home'],
  ['/faq/', '', 'wild', null, 'faq'],
  ['/privacy/', '?format=wild', 'wild', null, 'privacy'],
  // Before the query is known (server render, hydration) a page of both formats decides nothing,
  // except where the path already says Wild.
  ['/standard/meta/', null, null, null, 'standard-meta'],
  ['/standard/matchups/', null, 'standard', null, 'standard-matchups'],
  ['/standard/deck-builder/', null, 'wild', null, 'deck-builder'],
  ['/standard/archetypes/wild/quest-mage', null, null, 'wild', 'wild-archetypes'],
  ['/standard/archetypes/standard/quest-mage', null, null, 'standard', 'constructed-archetypes'],
  ['/standard/patches/', null, null, null, 'patch-notes'],
  ['/standard/vicious-gold/', null, null, 'standard', 'standard-vicious-gold'],
  ['/classes/', null, null, 'arena', 'winrates'],
];

test('an address names the menu mode and the highlighted item', () => {
  for (const [path, search, remembered, mode, item] of ROWS) {
    assert.deepEqual(navigationPlace(path, search, remembered), { mode, item }, `${path}${search ?? ' (query unknown)'} remembered ${remembered}`);
  }
});

test('every Wild item opens a page that its own address puts in Wild, except the shared one', () => {
  for (const wild of WILD_NAVIGATION_ITEMS) {
    const [path, search = ''] = wild.path.split(/(?=\?)/);
    const place = navigationPlace(path, search, 'wild');
    assert.deepEqual(place, { mode: 'wild', item: wild.id }, wild.path);
    // The same page in Standard highlights its twin.
    if (!('shared' in wild) && search) assert.equal(navigationPlace(path, '', 'wild').item, wild.twin, `${wild.path} without the format`);
  }
});

test('the Wild list has the pages of the issue and no VS Gold', () => {
  assert.deepEqual(WILD_NAVIGATION_ITEMS.map(item => [item.id, item.path]), [
    ['wild-meta', '/standard/meta/wild'],
    ['wild-matchups', '/standard/matchups/wild'],
    ['wild-archetypes', '/standard/archetypes?format=wild'],
    ['wild-fun-decks', '/standard/fun-decks?format=wild'],
    ['wild-cards', '/standard/cards/wild'],
    ['wild-deck-builder', '/standard/deck-builder?format=wild'],
    ['wild-patch-notes', '/standard/patches'],
  ]);
  assert.equal(WILD_NAVIGATION_ITEMS.some(item => String(item.twin) === 'standard-vicious-gold'), false);
  assert.deepEqual(NAVIGATION_MODES.map(mode => mode.id), ['standard', 'wild', 'arena', 'battlegrounds', 'community'], 'the banners are in this order');
});

test('a Wild item has the access of its twin', () => {
  assert.deepEqual(WILD_NAVIGATION_ITEMS.map(item => [item.id, item.entitlement]), [
    ['wild-meta', 'standard'], ['wild-matchups', 'standard'], ['wild-archetypes', 'standard'], ['wild-fun-decks', 'standard'],
    ['wild-cards', null], ['wild-deck-builder', null], ['wild-patch-notes', null],
  ]);
  assert.equal(pathOfMenuItem('wild-cards'), '/standard/cards/wild');
  assert.equal(pathOfMenuItem('standard-cards'), '/standard/cards');
});
