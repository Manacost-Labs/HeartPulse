import assert from 'node:assert/strict';
import { csrfRequestAllowed, mutationNeedsCsrfProtection, normalizedRequestPath, requestTargetPath } from '../server/csrf.js';

const base = {
  method: 'POST',
  path: '/api/subscription/refresh',
  authCookiePresent: true,
  csrfHeader: '1',
  origin: 'https://arena.hs-manacost.ru',
  secFetchSite: 'same-origin',
  appUrl: 'https://arena.hs-manacost.ru',
};

assert.equal(mutationNeedsCsrfProtection('GET', '/api/admin/users'), false);
assert.equal(mutationNeedsCsrfProtection('POST', '/api/articles/example/vote'), false);
assert.equal(mutationNeedsCsrfProtection('POST', '/api/admin/users'), true);
assert.equal(mutationNeedsCsrfProtection('PATCH', '/api/auth/profile'), true);
assert.equal(mutationNeedsCsrfProtection('POST', '/api/auth/logout'), true);
assert.equal(mutationNeedsCsrfProtection('POST', '/api/auth/telegram/link-code'), true);
assert.equal(mutationNeedsCsrfProtection('POST', '/api/auth/telegram/link-start'), true);
assert.equal(mutationNeedsCsrfProtection('POST', '/api/account/sessions/revoke-others'), true);
assert.equal(mutationNeedsCsrfProtection('POST', '/api/account/sessions/AbCdEfGhIjKlMnOpQrStUv/revoke'), true);
assert.equal(mutationNeedsCsrfProtection('GET', '/api/account/sessions'), false);
// Express routes ignore case, so every spelling of a protected path is protected.
for (const path of ['/API/account/sessions/revoke-others', '/Api/Account/SESSIONS/revoke-others/', '/api/account/sessions/AbCdEfGhIjKlMnOpQrStUv/REVOKE',
  '/API/AUTH/LOGOUT', '/Api/Auth/Profile/', '/api/ADMIN/users', '/api/Subscription/Refresh', '/api/%61ccount/sessions/revoke-others']) {
  assert.equal(mutationNeedsCsrfProtection('POST', path), true, path);
}
assert.equal(mutationNeedsCsrfProtection('POST', '/api/%E0%A4%A'), false, 'a malformed escape is compared as written');
assert.equal(mutationNeedsCsrfProtection('POST', '/api/v1/oauth/device/approve'), true);
assert.equal(mutationNeedsCsrfProtection('DELETE', '/api/admin-articles'), true);
assert.equal(csrfRequestAllowed(base), true);
assert.equal(csrfRequestAllowed({ ...base, authCookiePresent: false, csrfHeader: '', origin: '' }), true);
assert.equal(csrfRequestAllowed({ ...base, authorization: 'Bearer integration-token', csrfHeader: '', origin: '', secFetchSite: '' }), false,
  'a bearer header does not excuse a cookie request from coming from this site');
assert.equal(csrfRequestAllowed({ ...base, authorization: 'Bearer integration-token', csrfHeader: '' }), true);
assert.equal(csrfRequestAllowed({ ...base, authorization: 'Bearer integration-token', authCookiePresent: false, csrfHeader: '', origin: '' }), true);
assert.equal(csrfRequestAllowed({ ...base, csrfHeader: '' }), false);
assert.equal(csrfRequestAllowed({ ...base, origin: '', secFetchSite: '' }), false);
assert.equal(csrfRequestAllowed({ ...base, origin: '' }), true, 'Sec-Fetch-Site: same-origin alone proves a same-site browser request');
assert.equal(csrfRequestAllowed({ ...base, origin: 'https://evil.example' }), false);
assert.equal(csrfRequestAllowed({ ...base, secFetchSite: 'cross-site' }), false);
assert.equal(csrfRequestAllowed({ ...base, origin: 'http://localhost:3000' }), false);
assert.equal(csrfRequestAllowed({ ...base, origin: 'http://localhost:3000', allowLocalDevelopmentOrigins: true }), true);
assert.equal(csrfRequestAllowed({ ...base, path: '/api/auth/telegram/link-start', csrfHeader: '' }), false);

// Routing sees these spellings as the same path.
assert.equal(normalizedRequestPath('/API//Account/./SESSIONS/x/../revoke-others/'), '/api/account/sessions/revoke-others');
assert.equal(normalizedRequestPath('/api/account%2Fsessions%2Frevoke-others'), '/api/account/sessions/revoke-others');

// Deny by default: every cookie mutation must come from this site, whatever the path and its spelling.
const crossSite = { ...base, origin: 'https://evil.example', secFetchSite: 'cross-site', csrfHeader: '' };
for (const path of ['/api/account/sessions/revoke-others', '/api//account/sessions/revoke-others', '/api/./account/sessions/revoke-others',
  '/api/account%2Fsessions/revoke-others', '/API/Account/SESSIONS/revoke-others/', '/api//account/sessions/AbCdEfGhIjKlMnOpQrStUv/revoke',
  '/api/articles/example/vote', '/api/some/route/nobody/listed', '/api/v1/oauth/token/../../../account/sessions/revoke-others']) {
  assert.equal(csrfRequestAllowed({ ...crossSite, path }), false, path);
  assert.equal(csrfRequestAllowed({ ...crossSite, path, method: 'DELETE' }), false, `DELETE ${path}`);
  assert.equal(csrfRequestAllowed({ ...crossSite, path, origin: '', secFetchSite: '' }), false, `${path} without Origin`);
}
assert.equal(csrfRequestAllowed({ ...base, path: '/api/articles/example/vote', csrfHeader: '' }), true, 'same-origin without the header, outside the list');
assert.equal(csrfRequestAllowed({ ...base, path: '/api//account/sessions/revoke-others', csrfHeader: '' }), false, 'the list needs the header in any spelling');
assert.equal(csrfRequestAllowed({ ...crossSite, method: 'GET', path: '/api/account/sessions' }), true);
assert.equal(csrfRequestAllowed({ ...crossSite, authCookiePresent: false, path: '/api/account/sessions/revoke-others' }), true,
  'without the cookie the request cannot act as the visitor');
// An exemption is never granted through a decoded, dotted or doubled spelling:
// Express routes these raw paths to session routes, so they stay same-origin only.
for (const path of ['/api/account/sessions/..%2F..%2Fv1%2Foauth/revoke', '/api/account/sessions/..%2f..%2fv1%2foauth/revoke',
  '/api/account/sessions/%2e%2e%2f%2e%2e%2fv1%2foauth/revoke', '/api/v1/oauth/revoke/..%2F..%2Faccount/sessions/revoke-others',
  '/api/v1/oauth/revoke/../../account/sessions/revoke-others', '//api/v1/oauth/token', '/api//v1/oauth/token', '/api/v1/oauth/./token',
  '/api/v1/oauth/token;x', '/api/v1/oauth%2Ftoken', '/api/v1/oauth/token//', 'http://evil.example/api/v1/oauth/token']) {
  assert.equal(csrfRequestAllowed({ ...crossSite, path }), false, path);
}
assert.equal(csrfRequestAllowed({ ...crossSite, path: '/API/V1/OAuth/Token/' }), true, 'case and one trailing slash are how Express routes');
// Cookie-free machine endpoints stay reachable from other sites and servers.
for (const path of ['/api/auth/telegram/bot/webhook', '/api/newsletter/unsubscribe', '/api/v1/oauth/token', '/api/v1/oauth/device/code',
  '/api/v1/oauth/revoke', '/api/v1/tracker/events/batch', '/api/ecosystem/internal/subscription']) {
  assert.equal(csrfRequestAllowed({ ...crossSite, path }), true, path);
}

// An absolute-form target routes by its path: scheme and host are dropped, nothing else changes.
assert.equal(requestTargetPath('/api/account/sessions/revoke-others?x=1'), '/api/account/sessions/revoke-others');
assert.equal(requestTargetPath('https://hearthpulse.net/api/account/sessions/revoke-others?x=1'), '/api/account/sessions/revoke-others');
assert.equal(requestTargetPath('HTTP://evil.example:8080/api/v1/oauth/token'), '/api/v1/oauth/token');
assert.equal(requestTargetPath('https://hearthpulse.net'), '/');
assert.equal(requestTargetPath('https://h/api/v1/oauth/x/../token'), '/api/v1/oauth/x/../token', 'dot segments stay as sent');
assert.equal(csrfRequestAllowed({ ...base, path: requestTargetPath('https://hearthpulse.net/api/account/sessions/revoke-others'), csrfHeader: '' }), false,
  'the listed path still needs the header in absolute form');

console.log('cookie mutation CSRF boundary tests passed');
