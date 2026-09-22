import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(
  new URL('../src/modules/applicationConnect/ApplicationConnectPage.tsx', import.meta.url),
  'utf8',
);
const view = readFileSync(
  new URL('../src/modules/applicationConnect/ApplicationConnectView.tsx', import.meta.url),
  'utf8',
);
const client = readFileSync(
  new URL('../src/modules/applicationConnect/api/client.ts', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../src/modules/applicationConnect/applicationConnect.css', import.meta.url),
  'utf8',
);
const accountRoute = readFileSync(
  new URL('../src/modules/accountRoute/AccountRoute.tsx', import.meta.url),
  'utf8',
);
const identityPublicEntry = readFileSync(
  new URL('../src/modules/identity/public.ts', import.meta.url),
  'utf8',
);
const deferredRoutes = readFileSync(
  new URL('../src/features/DeferredRoutes.tsx', import.meta.url),
  'utf8',
);
const appSource = readFileSync(
  new URL('../src/App.tsx', import.meta.url),
  'utf8',
);

assert.match(view, /Подключить Manacost Tracker/);
assert.match(view, /Этапы подключения/);
assert.match(view, /Разрешить подключение/);
assert.match(view, /Приложение не сможет изменять профиль/);
assert.match(view, /Пароль не передаётся/);
assert.match(view, /aria-current/);
assert.doesNotMatch(page, /\bfetch\s*\(/);
assert.doesNotMatch(page, /features\/DeferredRoutes/);
assert.match(accountRoute, /loginPanelComponent=\{LazyLoginPanel\}/);
assert.match(client, /X-CSRF-Request/);
assert.match(client, /credentials: 'same-origin'/);
assert.match(view, /role="alert"/);
assert.doesNotMatch(`${page}\n${view}`, /adminAllowed|contactTelegram|blockedAt/);

assert.match(styles, /:focus-visible/);
assert.match(styles, /min-height: 3rem/);
assert.match(styles, /@media \(max-width: 760px\)/);
assert.match(styles, /@media \(max-width: 540px\)/);
assert.match(styles, /height: 3rem;\s+flex: 0 0 auto/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);

assert.match(page, /\.\.\/identity\/public/,
  'Application Connect must consume the identity module public contract');
assert.match(accountRoute, /\.\.\/identity\/public/,
  'the account route must consume the identity module public contract');
assert.doesNotMatch(`${page}\n${accountRoute}`, /features\/DeferredRoutes/,
  'account surfaces must not reach back into the legacy deferred-route bundle');
assert.match(identityPublicEntry, /loadLoginPanel[\s\S]*?import\('\.\/ui\/LoginPanel'\)/,
  'the identity module public contract must expose a lazy login-panel loader');
assert.match(identityPublicEntry, /loadPublicProfilePage[\s\S]*?import\('\.\/ui\/PublicProfilePage'\)/,
  'the identity module public contract must expose a lazy public-profile loader');
assert.doesNotMatch(identityPublicEntry, /export\s+\{\s*LoginPanel\s*\}/,
  'the large login panel must not become an eager identity public export');
assert.doesNotMatch(identityPublicEntry, /export\s+\{\s*PublicProfilePage\s*\}/,
  'the public-profile page must remain behind its route-level lazy boundary');
assert.doesNotMatch(deferredRoutes, /export function LoginPanel\s*\(/,
  'the legacy deferred-route bundle must not own the account login panel');
for (const [label, source] of [['App', appSource], ['DeferredRoutes', deferredRoutes]] as const) {
  assert.doesNotMatch(source, /type AuthUser\s*=/,
    `${label} must consume the canonical identity user contract`);
  assert.match(source, /modules\/identity\/public/,
    `${label} must reach identity through its public entry`);
}

console.log('application connection page contract tests passed');
