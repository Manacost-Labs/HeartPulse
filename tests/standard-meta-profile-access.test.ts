import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileSource = readFileSync(new URL('../src/modules/identity/ui/LoginPanel.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(
  profileSource,
  /canAccessAdminWorkspace\(authUser\)/,
  'profile admin links must follow the validated identity permission policy',
);
assert.match(
  appSource,
  /fetchCurrentAuthUser\(signal\)/,
  'the shell must consume the validated identity session contract',
);
assert.match(
  appSource,
  /canAccessAdminWorkspace\(appAuthUser\)/,
  'the shell must use the validated identity permission policy for administrative tools',
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
