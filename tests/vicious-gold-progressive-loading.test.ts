import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../server/standardMetaRoutes.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../src/features/ViciousSyndicateGold.tsx', import.meta.url), 'utf8');

assert.match(
  routeSource,
  /router\.get\('\/vicious-syndicate-gold\/builds'/,
  'slow deck hydration must have a dedicated protected endpoint',
);
assert.match(
  serverSource,
  /async function loadViciousSyndicateGoldBuilds\(/,
  'build enrichment must be isolated from the summary loader',
);

const summaryStart = serverSource.indexOf('async function loadViciousSyndicateGold()');
const buildsStart = serverSource.indexOf('async function loadViciousSyndicateGoldBuilds(');
assert.ok(summaryStart >= 0 && buildsStart > summaryStart, 'both Vicious Gold loaders must exist in source order');
const summarySource = serverSource.slice(summaryStart, buildsStart);
assert.doesNotMatch(
  summarySource,
  /fetchViciousConstructedDeckRows|resolveViciousGoldBuild|hydrateRecommendationDeckCards/,
  'the first useful response must not wait for deck lookup or card hydration',
);

assert.match(
  clientSource,
  /fetch\('\/api\/vicious-syndicate-gold\/builds'/,
  'the client must progressively fetch build details after the summary',
);
assert.match(
  clientSource,
  /setData\(summary/,
  'the summary must render independently from the build response',
);

console.log('Vicious Gold progressive-loading contracts passed');
