import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const appRoot = 'apps/public-web/app';
const inventory = JSON.parse(readFileSync('src/shared/seo/publicRouteInventory.json', 'utf8'));

function* pages(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* pages(path);
    else if (entry.name === 'page.tsx') yield path;
  }
}

// A prerendered page cannot vary its robots meta by query, so every query
// policy of such a page must reach the response as X-Robots-Tag.
test('prerendered pages send their query robots policy as a response header', async () => {
  // A runtime URL keeps the config's Next types out of the repository typecheck.
  const { default: config } = await import(new URL('../apps/public-web/next.config.mjs', import.meta.url).href);
  const headers = await config.headers();
  const prerendered = [...pages(appRoot)]
    .filter(file => /^export const revalidate\b/m.test(readFileSync(file, 'utf8')))
    .map(file => `/${relative(appRoot, file).replace(/\/?page\.tsx$/, '')}`);
  assert.ok(prerendered.includes('/tierlist'), 'fixture must find prerendered pages');
  const missing = [];
  for (const policy of inventory.queryPolicies) {
    const value = policy.indexPolicy === 'noindex-nofollow' ? 'noindex, nofollow' : 'noindex, follow';
    for (const pattern of policy.appliesTo.filter(route => prerendered.includes(route))) {
      for (const key of policy.parameters) {
        const sent = headers.some(rule => rule.source === `${pattern}/`
          && rule.has?.some(condition => condition.type === 'query' && condition.key === key)
          && rule.headers.some(header => header.key === 'X-Robots-Tag' && header.value === value));
        if (!sent) missing.push(`${pattern}?${key}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
