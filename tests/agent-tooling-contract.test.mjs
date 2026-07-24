import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_ALLOWED_URL_PATTERNS,
  buildChromeDevtoolsArgs,
  resolveChromeExecutable,
} from '../scripts/chrome-devtools-mcp.mjs';
import {
  buildSemgrepInvocation,
  isSemgrepSource,
  resolveSemgrepBase,
} from '../scripts/semgrep-changed.mjs';

test('project MCP config uses the guarded Chrome DevTools launcher', () => {
  const config = JSON.parse(readFileSync('.mcp.json', 'utf8'));
  assert.deepEqual(config.mcpServers['chrome-devtools'], {
    command: 'node',
    args: ['scripts/chrome-devtools-mcp.mjs'],
  });
});

test('Chrome DevTools defaults isolate sessions and minimize data exposure', () => {
  const args = buildChromeDevtoolsArgs({}, () => true);
  assert.match(resolveChromeExecutable({}, () => true), /google-chrome/);
  assert.ok(args.includes('--headless'));
  assert.ok(args.includes('--isolated'));
  assert.ok(args.includes('--no-usage-statistics'));
  assert.ok(args.includes('--no-performance-crux'));
  assert.ok(args.includes('--redact-network-headers'));
  assert.ok(args.includes('--screenshot-format=webp'));
  assert.ok(args.includes('--chrome-arg=--no-sandbox'));
  assert.doesNotMatch(args.join(' '), /user-data-dir|browser-url|accept-insecure|allow-unrestricted-paths/);
  for (const pattern of DEFAULT_ALLOWED_URL_PATTERNS) {
    assert.ok(args.includes(`--allowed-url-pattern=${pattern}`));
  }
});

test('Chrome sandbox can be retained explicitly and URL allowlist can be narrowed', () => {
  const args = buildChromeDevtoolsArgs({
    CHROME_BIN: '/opt/chrome',
    MANACOST_DEVTOOLS_CHROME_SANDBOX: '1',
    MANACOST_DEVTOOLS_ALLOWED_URL_PATTERNS: 'https://arena.hs-manacost.ru/*',
  }, candidate => candidate === '/opt/chrome');
  assert.ok(args.includes('--executable-path=/opt/chrome'));
  assert.ok(!args.includes('--chrome-arg=--no-sandbox'));
  assert.deepEqual(
    args.filter(argument => argument.startsWith('--allowed-url-pattern=')),
    ['--allowed-url-pattern=https://arena.hs-manacost.ru/*'],
  );
});

test('Semgrep scope includes authored JS/TS and excludes generated or vendored sources', () => {
  assert.equal(isSemgrepSource('src/App.tsx'), true);
  assert.equal(isSemgrepSource('server/index.ts'), true);
  assert.equal(isSemgrepSource('scripts/check.mjs'), true);
  assert.equal(isSemgrepSource('src/vendor/library.js'), false);
  assert.equal(isSemgrepSource('tests/fixture.ts'), false);
  assert.equal(isSemgrepSource('dist/app.js'), false);
});

test('Semgrep invocation is pinned, telemetry-free, read-only and nonblocking by default', () => {
  const invocation = buildSemgrepInvocation(['server/index.ts']);
  assert.equal(invocation.command, 'uvx');
  assert.deepEqual(invocation.args.slice(0, 4), ['--from', 'semgrep==1.171.0', 'semgrep', 'scan']);
  assert.ok(invocation.args.includes('--config=p/typescript'));
  assert.ok(invocation.args.includes('--metrics=off'));
  assert.ok(invocation.args.includes('--disable-version-check'));
  assert.ok(invocation.args.includes('--json'));
  assert.ok(!invocation.args.includes('--autofix'));
  assert.ok(!invocation.args.includes('--allow-local-builds'));
  assert.ok(!invocation.args.includes('--error'));
});

test('Semgrep base priority is deterministic', () => {
  const refs = new Map([
    ['release-base', 'a'.repeat(40)],
    ['origin/main', 'b'.repeat(40)],
    ['origin/release', 'c'.repeat(40)],
    ['HEAD^', 'd'.repeat(40)],
  ]);
  const resolveRef = ref => refs.get(ref) ?? null;
  assert.equal(resolveSemgrepBase({ SEMGREP_BASE: 'release-base' }, resolveRef), 'a'.repeat(40));
  assert.equal(resolveSemgrepBase({ GITHUB_BASE_REF: 'release' }, resolveRef), 'c'.repeat(40));
  assert.equal(resolveSemgrepBase({}, resolveRef), 'b'.repeat(40));
});
