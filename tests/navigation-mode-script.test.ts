import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { MODE_NAVIGATION_ATTRIBUTE, MODE_NAVIGATION_KEY, MODE_NAVIGATION_SCRIPT } from '../src/app/shell/navigationPreference.js';
import { navigationPlace } from '../src/app/routing/navigationPlace.js';
import type { NavigationModeId } from '../src/app/routing/navigationData.js';

/** Runs the head script as a browser would, before any HTML is painted; returns the attribute it left on <html>. */
function runHeadScript(pathname: string, search: string, stored: string | null): string | null {
  const attributes = new Map<string, string>();
  vm.runInNewContext(MODE_NAVIGATION_SCRIPT, {
    location: { pathname, search },
    localStorage: { getItem: (key: string) => (key === MODE_NAVIGATION_KEY ? stored : null) },
    document: { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } },
  });
  return attributes.get(MODE_NAVIGATION_ATTRIBUTE) ?? null;
}

const PATHS = [
  '/standard/meta/', '/standard/matchups/', '/standard/archetypes/', '/standard/fun-decks/', '/standard/cards/', '/standard/deck-builder/',
  '/standard/cards/wild/', '/standard/archetypes/wild/', '/standard/archetypes/wild/quest-mage/', '/standard/meta/wild/quest-mage/', '/standard/archetypes/standard/quest-mage/',
  '/standard/patches/', '/standard/patches/37-0-0/', '/standard/vicious-gold/', '/classes/', '/heroes/76521/', '/articles/', '/', '/faq/',
];
const SEARCHES = ['', '?format=wild', '?rank=all&format=wild', '?format=standard', '?format=wildcat', '?code=AAEBAQ'];
const STORED = [null, 'standard', 'wild', 'arena', 'battlegrounds', 'community', 'garbage'];

test('the head script and the menu agree on the mode of every address before the first paint', () => {
  for (const path of PATHS) {
    for (const search of SEARCHES) {
      for (const stored of STORED) {
        const remembered = (['standard', 'wild', 'arena', 'battlegrounds', 'community'] as const).find(mode => mode === stored) ?? null;
        // What the reader sees first: the mark of the server HTML where the path alone decides, else the script's attribute, else the default.
        const marked = navigationPlace(path, null, null).mode;
        const seen: NavigationModeId = marked ?? (runHeadScript(path, search, stored) as NavigationModeId | null) ?? 'standard';
        // What the menu settles on once it knows the query and the remembered mode.
        const settled = navigationPlace(path, search, remembered).mode ?? remembered ?? 'standard';
        assert.equal(seen, settled, `${path}${search} remembered ${stored}`);
      }
    }
  }
});

test('the script leaves a page outside Standard to the remembered choice and never throws', () => {
  assert.equal(runHeadScript('/', '?format=wild', 'wild'), 'wild');
  assert.equal(runHeadScript('/faq/', '', null), null);
  assert.equal(runHeadScript('/standard/meta/', '?format=wild', null), 'wild');
  assert.equal(runHeadScript('/standard/patches/', '', 'arena'), 'standard');
  assert.doesNotThrow(() => vm.runInNewContext(MODE_NAVIGATION_SCRIPT, { location: { pathname: '/standard/meta/', search: '?format=wild' }, document: { documentElement: { setAttribute() { throw new Error('blocked'); } } } }));
});
