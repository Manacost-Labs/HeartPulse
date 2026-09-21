import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const publicNavigationSource = readFileSync(new URL('../src/app/shell/PublicNavigation.tsx', import.meta.url), 'utf8');

assert.match(
  appSource,
  /adminAllowed:\s*Boolean\(data\.user\.adminAllowed\s*\?\?\s*data\.adminAllowed\)/,
  'the shell must preserve top-level adminAllowed from the auth contract for administrative tools',
);
assert.match(
  publicNavigationSource,
  /routes=\{STANDARD_TABS\}/,
  'Standard navigation must stay visible so guests can reach the Diamond paywall',
);
assert.match(appSource, /activeTabEntitlement === 'standard'[\s\S]*тарифом «Алмаз»/, 'traditional pages must name the required Diamond plan');

console.log('standard meta profile access assertions passed');
