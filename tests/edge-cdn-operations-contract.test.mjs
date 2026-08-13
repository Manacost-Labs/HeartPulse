import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const monitor = readFileSync('deploy/monitor-arena-geodns.sh', 'utf8');
const cache = readFileSync('deploy/nginx/arena-edge-cache-path.conf', 'utf8');
const cdnServer = readFileSync('deploy/nginx/arena-cdn-public-static.conf', 'utf8');

for (const address of ['162.19.220.14', '2001:41d0:701:1100::709b', '194.67.92.242', '186.246.28.244']) {
  assert.ok(monitor.includes(address), `regional monitor must cover ${address}`);
}

assert.match(cache, /max_size=18g/,
  'the shared cache must leave capacity headroom on the 40 GB Limburg edge');
assert.match(cache, /inactive=7d/,
  'inactive cache entries must age out before filling the smallest edge');

assert.match(cdnServer, /gzip on;/);
assert.match(cdnServer, /gzip_vary on;/);
assert.match(cdnServer, /gzip_types[^;]*application\/javascript/,
  'the CDN hostname must compress JavaScript when public assets are enabled');

assert.match(monitor, /disk_available_bytes/,
  'the monitor must fail before an edge exhausts disk space');
assert.match(monitor, /cdn\.arena\.hs-manacost\.ru/,
  'the dedicated CDN hostname must be checked separately from the application');
assert.match(monitor, /xa3umh5n3j\.cdn\.twcstorage\.ru/,
  'the Timeweb fallback plane must be checked explicitly');
assert.match(monitor, /runtime-config\.js/,
  'the Timeweb probe must catch stale runtime configuration');
assert.match(monitor, /api\/health\/ready/,
  'the Timeweb probe must keep dynamic API responses out of browser caches');
assert.match(monitor, /no-store/,
  'the Timeweb probe must preserve origin browser-cache safety');
assert.match(monitor, /max-age=2592000/,
  'the Timeweb card probe must enforce the 30-day browser-cache policy');
assert.match(monitor, /immutable/,
  'the Timeweb card probe must enforce immutable card delivery');
assert.match(monitor, /Accept-Encoding: gzip/,
  'CDN compression must be tested with content negotiation');
assert.match(monitor, /api\/subscription\/status/,
  'a private route must remain unavailable through the CDN hostname');

console.log('edge CDN operational contracts passed');
