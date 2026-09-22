import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fetchPublicProfile } from '../src/modules/identity/api/publicProfileApi.js';
import {
  publicProfileIdFromPath,
  publicProfilePath,
} from '../src/modules/identity/public.js';
import { isKnownPath, tabFromPath } from '../src/routes.js';

assert.equal(publicProfileIdFromPath('/id/1'), '1');
assert.equal(publicProfileIdFromPath('/id/2147483647/'), '2147483647');
assert.equal(publicProfileIdFromPath('/id/01'), null);
assert.equal(publicProfileIdFromPath('/id/2147483648'), null);
assert.equal(publicProfileIdFromPath('/id/%31'), null);
assert.equal(publicProfileIdFromPath('/id/user_internal_id'), null);

const legacyPublicProfileId = 'p_AbCdEfGhIjKlMnOpQrStUv';
assert.equal(publicProfileIdFromPath(`/profiles/${legacyPublicProfileId}`), legacyPublicProfileId,
  'old shared profile links must remain readable during migration');
assert.equal(publicProfileIdFromPath('/profiles/p_short'), null);
assert.equal(publicProfileIdFromPath('/profiles/p_../../admin'), null);

assert.equal(publicProfilePath('1'), '/id/1');
assert.equal(publicProfilePath('01'), '/');
assert.equal(publicProfilePath('2147483648'), '/');
assert.equal(publicProfilePath('user_internal_id'), '/');
assert.equal(isKnownPath('/id/1'), true);
assert.equal(isKnownPath(`/profiles/${legacyPublicProfileId}`), true);
assert.equal(isKnownPath('/id/user_internal_id'), false);
assert.equal(tabFromPath('/id/1'), 'home');

const identityPublicEntry = readFileSync(
  new URL('../src/modules/identity/public.ts', import.meta.url),
  'utf8',
);
const accountRoute = readFileSync(
  new URL('../src/modules/accountRoute/AccountRoute.tsx', import.meta.url),
  'utf8',
);
const publicProfilePage = readFileSync(
  new URL('../src/modules/identity/ui/PublicProfilePage.tsx', import.meta.url),
  'utf8',
);
const loginPanel = readFileSync(
  new URL('../src/modules/identity/ui/LoginPanel.tsx', import.meta.url),
  'utf8',
);
const moduleBoundaries = JSON.parse(readFileSync(
  new URL('../config/module-boundaries.json', import.meta.url),
  'utf8',
)) as {
  allowlistBudgets: { moduleLegacyImport: number };
  exceptions: { moduleLegacyImport: Array<{ source: string; target: string }> };
};

assert.match(
  identityPublicEntry,
  /loadPublicProfilePage[\s\S]*?import\('\.\/ui\/PublicProfilePage'\)[\s\S]*?then\(module => \(\{ default: module\.default \}\)\)/,
  'identity must expose only the default public-profile page through its lazy loader',
);
assert.match(
  accountRoute,
  /LazyPublicProfilePage = React\.lazy\(loadPublicProfilePage\)/,
  'the account route must reuse the identity public loader at module scope',
);
assert.doesNotMatch(
  accountRoute,
  /features\/PublicProfilePage/,
  'the account route must not reach back into the legacy feature tree',
);
assert.doesNotMatch(
  identityPublicEntry,
  /export\s+\{[^}]*\bPublicProfilePage\b/,
  'the public-profile page must not become an eager identity export',
);
assert.match(publicProfilePage, /\.\.\/api\/publicProfileApi/,
  'the public-profile UI must delegate network I/O to the identity API owner');
assert.match(publicProfilePage, /\.\.\/\.\.\/\.\.\/shared\/seo\/publicUrlPolicy/,
  'the public-profile UI must consume the shared public URL policy');
assert.doesNotMatch(publicProfilePage, /LoginPanel/,
  'the public-profile route must not import the login route');
assert.doesNotMatch(loginPanel, /PublicProfilePage/,
  'the login route must not import the public-profile route');
for (const retiredPath of [
  '../src/profileRoutes.ts',
  '../src/features/PublicProfilePage.tsx',
  '../src/components/ProfileIdentityHero.tsx',
  '../src/components/AuthAvatar.tsx',
]) {
  assert.equal(existsSync(new URL(retiredPath, import.meta.url)), false,
    `${retiredPath} must not remain as a second source owner`);
}
assert.equal(
  moduleBoundaries.allowlistBudgets.moduleLegacyImport,
  5,
  'the identity profile migration must ratchet away both legacy edges',
);
assert.equal(
  moduleBoundaries.exceptions.moduleLegacyImport.some(({ source, target }) => (
    source.startsWith('src/modules/identity/')
    || target === 'src/features/PublicProfilePage.tsx'
    || target === 'src/components/ProfileIdentityHero.tsx'
  )),
  false,
  'identity and account routing must not retain profile-related legacy exceptions',
);

const originalFetch = globalThis.fetch;
try {
  const controller = new AbortController();
  const expectedProfile = {
    publicProfileId: '7',
    name: 'Игрок',
    avatarInitials: 'ИГ',
    createdAt: '2026-07-28T00:00:00.000Z',
  };
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(JSON.stringify({ profile: expectedProfile }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  assert.deepEqual(await fetchPublicProfile('7/encoded', controller.signal), expectedProfile);
  assert.equal(requestedUrl, '/api/profiles/7%2Fencoded');
  assert.deepEqual(requestedInit?.headers, { Accept: 'application/json' });
  assert.equal(requestedInit?.signal, controller.signal);

  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Профиль закрыт' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
  await assert.rejects(
    fetchPublicProfile('7', controller.signal),
    /Профиль закрыт/,
  );

  globalThis.fetch = (async () => new Response('not json', { status: 502 })) as typeof fetch;
  await assert.rejects(
    fetchPublicProfile('7', controller.signal),
    /Профиль не найден/,
  );

  globalThis.fetch = (async () => new Response(JSON.stringify({
    profile: { publicProfileId: '7', name: 42 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
  await assert.rejects(
    fetchPublicProfile('7', controller.signal),
    /Профиль не найден/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('numeric public profile client route contracts passed');
