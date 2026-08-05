import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(pathname) {
  return readFile(new URL(pathname, ROOT), 'utf8');
}

test('shared Battlegrounds runtime loads every page of the current trinket pool', async () => {
  const shared = await source('public/bg-legacy/shared.js');

  assert.match(shared, /\/api\/bg\/library\/extra\/trinket/);
  assert.match(shared, /in_pool:\s*"1"/);
  assert.match(shared, /pagination\?\.total_pages/);
  assert.match(shared, /window\.accessoriesData\s*=\s*current/);
  assert.match(shared, /return fallback/);
  assert.doesNotThrow(() => new Function(shared));
});

test('both active builders wait for the synchronized trinket pool', async () => {
  const [strategy, tier] = await Promise.all([
    source('public/bg-legacy/strategy-builder.gridfix2.js'),
    source('public/bg-legacy/hero-tier-builder.js'),
  ]);

  for (const builder of [strategy, tier]) {
    assert.match(builder, /await window\.Shared\.loadCurrentAccessoriesData\(\)/);
    assert.match(builder, /text:\s*stripHtml\(card\.text \|\| ""\)/);
    assert.doesNotThrow(() => new Function(builder));
  }
});
