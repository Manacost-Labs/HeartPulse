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
import {
  GITLEAKS_IMAGE,
  buildGitleaksArgs,
} from '../scripts/gitleaks.mjs';

test('project MCP config uses the guarded Chrome DevTools launcher', () => {
  const config = JSON.parse(readFileSync('.mcp.json', 'utf8'));
  assert.deepEqual(config.mcpServers['chrome-devtools'], {
    command: 'node',
    args: ['scripts/chrome-devtools-mcp.mjs'],
  });
  assert.deepEqual(config.mcpServers.sentry, {
    type: 'http',
    url: 'https://mcp.sentry.dev/mcp',
  });
  assert.deepEqual(config.mcpServers.storybook, {
    type: 'http',
    url: 'http://127.0.0.1:6006/mcp',
  });
});

test('AGENTS enforces the installed skill router and task-specific quality skills', () => {
  const instructions = readFileSync('AGENTS.md', 'utf8');
  for (const requiredSkill of [
    'agent-resource-index',
    'agent-skills:using-agent-skills',
    'agent-skills:context-engineering',
    'agent-skills:spec-driven-development',
    'agent-skills:planning-and-task-breakdown',
    'agent-skills:incremental-implementation',
    'agent-skills:test-driven-development',
    'agent-skills:debugging-and-error-recovery',
    'frontend-design',
    'typeui/skills/fundamentals/SKILL.md',
    'agent-skills:browser-testing-with-devtools',
    'build-web-apps:react-best-practices',
    'build-web-apps:frontend-testing-debugging',
    'agent-skills:api-and-interface-design',
    'agent-skills:performance-optimization',
    'web-quality-skills/skills/',
    'agent-skills:observability-and-instrumentation',
    'agent-skills:source-driven-development',
    'agent-skills:doubt-driven-development',
    'agent-skills:security-and-hardening',
    'agent-skills:ci-cd-and-automation',
    'agent-skills:deprecation-and-migration',
    'agent-skills:documentation-and-adrs',
    'agent-skills:git-workflow-and-versioning',
    'agent-skills:code-review-and-quality',
    'agent-skills:code-simplification',
    'agent-skills:shipping-and-launch',
    '`codegraph`',
    '`context7`',
  ]) {
    assert.match(instructions, new RegExp(requiredSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(instructions, /Every matching row is required, not optional/);
  assert.match(instructions, /read every selected `SKILL\.md` completely/i);
  assert.match(instructions, /real-browser review/);
  assert.match(instructions, /console errors\/warnings/);
  assert.match(instructions, /accessibility structure/);
  assert.match(instructions, /Storybook is the required component workshop/);
  assert.match(instructions, /npm run test:storybook/);
  assert.match(instructions, /npm run build-storybook/);
  assert.match(instructions, /never expose[\s\S]*MCP endpoint through production Nginx/i);
});

test('AGENTS coordinates concurrent sessions through isolated worktrees and a shared preflight', () => {
  const instructions = readFileSync('AGENTS.md', 'utf8');
  assert.match(instructions, /Required Multi-Session Coordination/);
  assert.match(instructions, /one task[\s\S]*one branch[\s\S]*one worktree/i);
  assert.match(instructions, /npm run agent:session:preflight/);
  assert.match(instructions, /npm run agent:integration:preflight/);
  assert.match(instructions, /overlapping uncommitted paths/i);
  assert.match(instructions, /fast-forward/i);
  assert.match(instructions, /Only a successful push to `main` may trigger production/i);
});

test('AGENTS preserves the shared parser scrape-provider order from the concurrent session', () => {
  const instructions = readFileSync('AGENTS.md', 'utf8');
  assert.match(instructions, /Parser scrape providers \(hs-data-api\)/);
  assert.match(instructions, /1\. Scrape\.do \(primary\)[\s\S]*2\. Firecrawl key rotation[\s\S]*3\. Scrapfly \(last resort\)/);
  assert.match(instructions, /Do not invent a Firecrawl-first path/);
});

test('AGENTS enforces the modular architecture and documentation contract', () => {
  const instructions = readFileSync('AGENTS.md', 'utf8');
  const boundaries = readFileSync('docs/architecture/module-boundaries.md', 'utf8');
  const decision = readFileSync(
    'docs/decisions/002-domain-modules-and-documentation-contract.md',
    'utf8',
  );
  assert.match(instructions, /Required Code and Documentation Contract/);
  assert.match(instructions, /Documentation impact/);
  assert.match(instructions, /why[\s\S]*invariant/i);
  assert.match(instructions, /docs\/architecture\//);
  assert.match(instructions, /docs\/decisions\//);
  assert.match(instructions, /docs\/specs\//);
  assert.match(instructions, /docs\/runbooks\//);
  assert.match(instructions, /same task and commit/i);
  assert.match(instructions, /Stale documentation blocks completion/i);
  assert.match(instructions, /docs\/architecture\/module-boundaries\.md/);
  assert.match(boundaries, /app -> modules -> shared/);
  assert.match(boundaries, /Do not create catch-all `utils`, `common`/);
  assert.match(boundaries, /Definition of done for a module slice/);
  assert.match(decision, /Status: Accepted/);
  assert.match(decision, /one independently deployable vertical slice/i);
});

test('Claude uses AGENTS as the shared mandatory project contract', () => {
  const instructions = readFileSync('CLAUDE.md', 'utf8');
  assert.match(instructions, /read and follow \[AGENTS\.md\]\(AGENTS\.md\) completely/i);
  assert.match(instructions, /single source of truth/i);
  assert.match(instructions, /mandatory skill routing/i);
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
  for (const shadowPattern of [
    'https://hearthpulse.net/*',
    'https://www.hearthpulse.net/*',
    'https://cdn.hearthpulse.net/*',
  ]) {
    assert.ok(DEFAULT_ALLOWED_URL_PATTERNS.includes(shadowPattern));
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

test('Gitleaks scans the complete repository history with a pinned image and redaction', () => {
  assert.match(GITLEAKS_IMAGE, /@sha256:[a-f0-9]{64}$/);
  const args = buildGitleaksArgs('/workspace/manacost-arena');
  assert.deepEqual(args.slice(0, 7), [
    'run',
    '--rm',
    '-v',
    '/workspace/manacost-arena:/repo',
    '-w',
    '/repo',
    GITLEAKS_IMAGE,
  ]);
  assert.ok(args.includes('git'));
  assert.ok(args.includes('--redact'));
  assert.ok(args.includes('--verbose'));
  assert.ok(!args.includes('--no-redact'));
  const workingTreeArgs = buildGitleaksArgs('/workspace/manacost-arena', 'dir');
  assert.ok(workingTreeArgs.includes('dir'));
  assert.equal(workingTreeArgs.at(-1), '.');

  const linkedWorktreeArgs = buildGitleaksArgs(
    '/workspace/task-worktree',
    'git',
    '/workspace/main-repository/.git',
  );
  assert.ok(linkedWorktreeArgs.includes(
    '/workspace/main-repository/.git:/workspace/main-repository/.git:ro',
  ));

  const config = readFileSync('.gitleaks.toml', 'utf8');
  assert.match(config, /useDefault\s*=\s*true/);
  assert.match(config, /\^build\//);
  assert.match(config, /\^dist\//);
  assert.match(config, /\^storybook-static\//);
});
