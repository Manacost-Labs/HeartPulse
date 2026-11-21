import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { contentSecurityPolicy, contentSecurityPolicyHeaders, inlineScriptHash } from '../apps/public-web/contentSecurityPolicy.mjs';

test('a hash source is the base64 sha256 of the exact script text', () => {
  assert.equal(inlineScriptHash(''), 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
  assert.equal(inlineScriptHash('alert(1)'), 'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI=');
});

test('the policy allows this origin, the registered hashes and the two script hosts only', () => {
  assert.equal(contentSecurityPolicy({ scriptHashes: ['sha256-one', 'sha256-two'] }),
    "script-src 'self' 'sha256-one' 'sha256-two' https://stats.hs-manacost.ru https://telegram.org 'report-sample'; "
    + "object-src 'none'; base-uri 'self'");
  assert.equal(contentSecurityPolicy({ scriptHashes: [], reportUri: '/api/csp-report' }),
    "script-src 'self' https://stats.hs-manacost.ru https://telegram.org 'report-sample'; object-src 'none'; base-uri 'self'; "
    + 'report-uri /api/csp-report');
});

test('without the flag no document gets a policy', () => {
  assert.deepEqual(contentSecurityPolicyHeaders({}), []);
  assert.deepEqual(contentSecurityPolicyHeaders({ HEARTHPULSE_CSP_REPORT_ONLY: 'true' }), []);
  assert.deepEqual(contentSecurityPolicyHeaders({ HEARTHPULSE_CSP_REPORT_URI: '/api/csp-report' }), []);
});

test('the flag sends the policy as report-only, never enforcing, to every page but the embeds', () => {
  const [entry, ...rest] = contentSecurityPolicyHeaders({ HEARTHPULSE_CSP_REPORT_ONLY: '1', HEARTHPULSE_CSP_REPORT_URI: 'https://reports.example/csp' });
  assert.deepEqual(rest, []);
  assert.equal(entry.source, '/((?!embed/).*)');
  assert.deepEqual(entry.headers.map(header => header.key), ['Content-Security-Policy-Report-Only']);
  assert.match(entry.headers[0].value, /^script-src 'self' 'sha256-[^']+' /);
  assert.match(entry.headers[0].value, /; report-uri https:\/\/reports\.example\/csp$/);
});

test('a report address that could break the header stops the build', () => {
  for (const value of ['http://reports.example/csp', 'reports.example', '/csp; script-src *', "/csp'"]) {
    assert.throws(() => contentSecurityPolicyHeaders({ HEARTHPULSE_CSP_REPORT_ONLY: '1', HEARTHPULSE_CSP_REPORT_URI: value }),
      /HEARTHPULSE_CSP_REPORT_URI must be a same-origin path or an https URL/, value);
  }
});

test('the checked-in hashes match every registered inline script', () => {
  const check = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/csp-inline-script-hashes.ts', '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});
