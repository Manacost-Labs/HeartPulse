import assert from 'node:assert/strict';
import { csrfRequestAllowed, mutationNeedsCsrfProtection } from '../server/csrf.js';

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
assert.equal(mutationNeedsCsrfProtection('DELETE', '/api/admin-articles'), true);
assert.equal(csrfRequestAllowed(base), true);
assert.equal(csrfRequestAllowed({ ...base, authCookiePresent: false, csrfHeader: '', origin: '' }), true);
assert.equal(csrfRequestAllowed({ ...base, authorization: 'Bearer integration-token', csrfHeader: '', origin: '' }), true);
assert.equal(csrfRequestAllowed({ ...base, csrfHeader: '' }), false);
assert.equal(csrfRequestAllowed({ ...base, origin: '' }), false);
assert.equal(csrfRequestAllowed({ ...base, origin: 'https://evil.example' }), false);
assert.equal(csrfRequestAllowed({ ...base, secFetchSite: 'cross-site' }), false);
assert.equal(csrfRequestAllowed({ ...base, origin: 'http://localhost:3000' }), false);
assert.equal(csrfRequestAllowed({ ...base, origin: 'http://localhost:3000', allowLocalDevelopmentOrigins: true }), true);

console.log('cookie mutation CSRF boundary tests passed');
