import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const configScriptPosition = indexHtml.indexOf('src="/runtime-config.js?v=cdn-20260804"');
const applicationScriptPosition = indexHtml.indexOf('src="/src/main.tsx"');

assert.ok(configScriptPosition >= 0, 'index.html must load the runtime config');
assert.ok(
  configScriptPosition < applicationScriptPosition,
  'runtime config must load before the application module',
);

const context = { window: {} };
vm.runInNewContext(
  readFileSync(new URL('../public/runtime-config.js', import.meta.url), 'utf8'),
  context,
);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.window.__ARENA_RUNTIME_CONFIG__)),
  {
    cardImageCdn: {
      enabled: false,
      origin: 'https://cdn.arena.hs-manacost.ru',
    },
  },
  'the repository default must fail closed to same-origin delivery',
);

console.log('runtime client config contract tests passed');
