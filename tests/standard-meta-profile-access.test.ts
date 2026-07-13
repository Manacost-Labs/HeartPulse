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
  'the shell must preserve top-level adminAllowed from the auth contract so admin-only Standard menu items stay visible',
);
assert.match(
  appSource,
  /const visibleStandardTabs = appIsAdmin[\s\S]*?STANDARD_TABS\.filter\(route => !ADMIN_ONLY_TAB_IDS\.has\(route\.id\)\)/,
  'full admins must receive every Standard menu item while non-admins lose admin-only routes',
);
assert.match(
  profileSource,
  /href="\/standard\/meta"\s+data-profile-admin-destination="standard-meta"/,
  'admin profile must expose a direct Standard meta beta link',
);

console.log('standard meta profile access assertions passed');
