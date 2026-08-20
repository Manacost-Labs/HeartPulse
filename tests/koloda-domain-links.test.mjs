import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync('server/index.ts', 'utf8');
const analytics = readFileSync('server/adminBoostyAnalyticsRoutes.ts', 'utf8');
const deferredRoutes = readFileSync('src/features/DeferredRoutes.tsx', 'utf8');

assert.match(
  server,
  /KHA_VIP_WP_BASE_URL[^\n]+https:\/\/kolodahearthstone\.com/,
  'VIP links must default to the canonical .com WordPress host',
);
assert.match(
  analytics,
  /https:\/\/kolodahearthstone\.com\/wp-json\/koloda\/v1\/articles\/query/,
  'analytics must query the canonical .com endpoint',
);
assert.match(
  deferredRoutes,
  /href:\s*'https:\/\/kolodahearthstone\.com\/'/,
  'the public network menu must link directly to .com',
);

for (const host of ['kolodahearthstone.com', 'kolodahearthstone.ru']) {
  assert.match(
    server,
    new RegExp(`['"]${host.replaceAll('.', '\\.')}['"]`),
    `${host} must remain accepted by the server during migration`,
  );
  assert.match(
    deferredRoutes,
    new RegExp(`['"]${host.replaceAll('.', '\\.')}['"]`),
    `${host} must remain accepted by the browser during migration`,
  );
}

console.log('Koloda domain link contract passed');
