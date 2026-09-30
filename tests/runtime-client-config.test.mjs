import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(
  readFileSync(new URL('../public/runtime-config.js', import.meta.url), 'utf8'),
  context,
);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.window.__ARENA_RUNTIME_CONFIG__)),
  {
    cardImageCdn: {
      enabled: true,
      origin: 'https://cdn.hearthpulse.net',
    },
  },
  'the canonical runtime must use the public HearthPulse CDN after cutover',
);

const layout = readFileSync(new URL('../apps/public-web/app/layout.tsx', import.meta.url), 'utf8');
assert.ok(
  layout.indexOf('window.__ARENA_RUNTIME_CONFIG__=') < layout.indexOf('<div id="root">'),
  'Next.js documents must define the runtime config before the application markup',
);

console.log('runtime client config contract tests passed');
