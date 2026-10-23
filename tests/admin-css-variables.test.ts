import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Admin section stylesheets read --admin-* values from the shared bridge in
 * src/modules/adminWorkspace/adminWorkspace.css. A value the bridge stopped defining
 * makes every rule that reads it invalid at computed time (a sticky `top` turned into
 * `auto` when the old frame's --admin-bar-h went away), so each name must stay defined.
 */
const bridge = 'src/modules/adminWorkspace/adminWorkspace.css';
const readers = [
  'src/features/contests.css',
  'src/features/adminPeople.css',
  'src/features/adminContent.css',
  'src/features/adminSessionNotice.css',
  'src/features/adminParserControl/DataHealthOverviewCard.css',
  'src/modules/adminCrm/adminCrm.css',
  'src/modules/adminCrm/adminOverview.css',
];
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const definedIn = (css: string) => new Set([...css.matchAll(/(--admin-[\w-]+)\s*:/g)].map(match => match[1]));
const defined = new Set([bridge, ...readers].flatMap(path => [...definedIn(read(path))]));

for (const path of readers) {
  // `var(--admin-x, fallback)` survives a missing name; only the bare form depends on the bridge.
  const bare = [...read(path).matchAll(/var\((--admin-[\w-]+)\s*\)/g)].map(match => match[1]);
  const missing = [...new Set(bare)].filter(name => !defined.has(name));
  assert.deepEqual(missing, [], `${path} reads admin variables nobody defines`);
}

console.log('admin CSS variables are all defined');
