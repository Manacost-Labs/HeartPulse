import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileSource = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(
  profileSource,
  /authUser\.adminAllowed\s*\|\|\s*authUser\.role\s*===\s*'admin'/,
  'profile must recognize both server-provided adminAllowed and the persisted admin role',
);
assert.match(
  appSource,
  /adminAllowed:\s*Boolean\(data\.user\.adminAllowed\s*\?\?\s*data\.adminAllowed\)/,
  'the shell must preserve top-level adminAllowed from the auth contract for administrative tools',
);
assert.match(
  appSource,
  /const visibleStandardTabs = STANDARD_TABS;/,
  'Standard navigation must stay visible so guests can reach the Diamond paywall',
);
assert.match(appSource, /activeTabEntitlement === 'standard'[\s\S]*тарифом «Алмаз»/, 'traditional pages must name the required Diamond plan');
assert.match(
  profileSource,
  /href="\/standard\/meta"\s+data-profile-admin-destination="standard-meta"/,
  'admin profile must expose a direct Standard meta link',
);

console.log('standard meta profile access assertions passed');
