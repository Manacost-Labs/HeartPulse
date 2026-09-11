import assert from 'node:assert/strict';

const previousWindow = globalThis.window;
const assignments: string[] = [];
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    location: {
      search: '',
      assign: (value: string) => assignments.push(value),
    },
  },
});

try {
  const { continueToCoverAfterLogin, coverSsoReturnTo } = await import('../src/modules/coverAdminSso/public.js');
  window.location.search = '?returnTo=%2Fapi%2Fauth%2Fcover%2Fstart';
  assert.equal(coverSsoReturnTo(), '/api/auth/cover/start');
  continueToCoverAfterLogin();
  assert.deepEqual(assignments, ['/api/auth/cover/start']);

  window.location.search = '?returnTo=https%3A%2F%2Fevil.example%2F';
  assert.equal(coverSsoReturnTo(), '');
  continueToCoverAfterLogin();
  assert.deepEqual(assignments, ['/api/auth/cover/start']);
} finally {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
}

console.log('Cover administrator SSO client contract tests passed');
