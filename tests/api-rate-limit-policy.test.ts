import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPublicDataApiRequest, isPublicMediaApiRequest, publicDataRouteTemplate } from '../server/apiRateLimitPolicy';
import { DEFAULT_SCRAPE_GUARD_CONFIG, parseScrapeGuardConfig } from '../server/publicDataScrapeGuard';

assert.equal(isPublicMediaApiRequest('GET', '/public-resource/db/uploads/card.png'), true);
assert.equal(isPublicMediaApiRequest('HEAD', '/article-cover'), true);
assert.equal(isPublicMediaApiRequest('POST', '/article-cover'), false);
assert.equal(isPublicMediaApiRequest('GET', '/constructed-cards'), false);
assert.equal(isPublicMediaApiRequest('GET', '/public-resource-unsafe/db/card.png'), false);

for (const path of [
  '/tierlist/public', '/legendaries/public', '/bg/heroes/public', '/bg/heroes/public/12345',
  '/bg/library/public/minion/123', '/bg/library/public/extra/pool/kind/1', '/public/constructed-cards/standard/BAR_1',
  '/winrates/public-teaser', '/guides-archive/teaser/some-slug', '/constructed-archetypes/teaser/standard/x',
  '/standard-meta/teaser', '/standard-meta/public', '/standard/matchups/public', '/bg/tier-lists/public', '/fun-decks',
  '/api/legendaries/public',
]) assert.equal(isPublicDataApiRequest('GET', path), true, path);
for (const path of ['/admin/fun-decks', '/constructed-cards', '/public-resource/db/a.png', '/article-cover', '/auth/session', '/account/public-profile', '/']) {
  assert.equal(isPublicDataApiRequest('GET', path), false, path);
}
assert.equal(isPublicDataApiRequest('POST', '/legendaries/public'), false);
assert.equal(isPublicDataApiRequest('HEAD', '/legendaries/public'), true);
assert.equal(publicDataRouteTemplate('/bg/library/public/minion/123?x=1'), '/api/bg/library/public/*');
assert.equal(publicDataRouteTemplate('/legendaries/public'), '/api/legendaries/public');
assert.equal(publicDataRouteTemplate('/guides-archive/teaser/my-secret-slug'), '/api/guides-archive/teaser/*');

// Contract: every unguarded GET registration with a public-data path is classified as public.
const manifest = JSON.parse(readFileSync(new URL('../config/http-route-manifest.json', import.meta.url), 'utf8'));
const publicPattern = /(^|\/)(public|teaser|public-teaser)(\/|$)|^(\/api)?\/(public|fun-decks)(\/|$)/;
let publicRoutes = 0;
for (const entry of manifest.registrations as Array<{ kind: string; method: string; path: string; guardSignals: string[] }>) {
  if (entry.kind !== 'route' || entry.method !== 'GET' || entry.guardSignals.length > 0) continue;
  const relative = entry.path.replace(/^\/api(?=\/)/, '');
  if (relative.startsWith('/admin/') || !publicPattern.test(relative)) continue;
  publicRoutes += 1;
  assert.equal(isPublicDataApiRequest('GET', relative), true, `route ${entry.path} must be classified as public data`);
}
assert.ok(publicRoutes >= 10, `expected the public data routes in the manifest, got ${publicRoutes}`);

// Config file: valid, and its values are what the runbook documents.
const shipped = JSON.parse(readFileSync(new URL('../config/public-data-api-guard.json', import.meta.url), 'utf8'));
assert.deepEqual(parseScrapeGuardConfig(shipped), { ...DEFAULT_SCRAPE_GUARD_CONFIG, mode: shipped.mode });
assert.ok(['log', 'enforce'].includes(shipped.mode));

console.log('API rate-limit policy tests passed');
