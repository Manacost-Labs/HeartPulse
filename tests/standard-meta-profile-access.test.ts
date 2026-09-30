import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const accessSource = readFileSync(new URL('../apps/public-web/ui/usePublicAccess.ts', import.meta.url), 'utf8');
const publicNavigationSource = readFileSync(new URL('../src/app/shell/PublicNavigation.tsx', import.meta.url), 'utf8');
const paywallSource = readFileSync(new URL('../src/components/PaywallGate.tsx', import.meta.url), 'utf8');

assert.match(
  accessSource,
  /fetchCurrentAuthUser\(controller\.signal\)/,
  'public pages must consume the validated identity session contract',
);
assert.match(
  accessSource,
  /canAccessAdminWorkspace\(user\)/,
  'public pages must use the validated identity permission policy for administrative tools',
);
assert.match(
  publicNavigationSource,
  /routes=\{STANDARD_TABS\}/,
  'Standard navigation must stay visible so guests can reach the Diamond paywall',
);
assert.match(paywallSource, /Тариф «Алмаз»/, 'traditional pages must name the required Diamond plan');

console.log('standard meta profile access assertions passed');
