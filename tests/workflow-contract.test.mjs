import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { FULL_SHARDS, planTestShards } from '../scripts/ci-test-plan.mjs';
import { planShards, TEST_SUITE_IDS, validateTestDurations } from '../scripts/test-suite-runner.mjs';

const workflow = readFileSync('.github/workflows/scrape.yml', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const mobileVisualWorkflow = readFileSync('.github/workflows/mobile-visual.yml', 'utf8');
const productionMonitorWorkflow = readFileSync('.github/workflows/production-monitor.yml', 'utf8');
const deployment = readFileSync('DEPLOYMENT.md', 'utf8');
const runnerSudoers = readFileSync('deploy/hs-arena-github-runner.sudoers', 'utf8');
const scraperService = readFileSync('deploy/hs-arena-scraper.service', 'utf8');

assert.match(workflow, /name:\s*Validate scraper manually/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(workflow, /hs-arena-scraper\.timer/);
assert.match(workflow, /actions\/checkout@v7/);
assert.match(workflow, /actions\/setup-node@v7/);
assert.match(workflow, /node-version:\s*'22'/);
assert.doesNotMatch(workflow, /^\s*schedule:/m);
assert.doesNotMatch(workflow, /\bgit\s+(?:add|commit|push)\b/);
assert.doesNotMatch(workflow, /contents:\s*write/);
assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/);
assert.match(workflow, /puppeteer\.executablePath\(\)/, 'manual scrape must use Puppeteer downloaded Chrome');
assert.match(workflow, /PUPPETEER_EXECUTABLE_PATH=.*GITHUB_ENV/, 'manual scrape must pass the resolved browser path to the scraper');
assert.match(workflow, /\[\[ -x \"\$browser_path\" \]\]/, 'manual scrape must reject a non-executable browser path');
assert.doesNotMatch(workflow, /PUPPETEER_SKIP_DOWNLOAD/, 'manual scrape must not suppress Puppeteer browser download');

assert.match(ciWorkflow, /name:\s*Validate and deploy application/);
assert.match(ciWorkflow, /^\s*push:\s*$/m);
assert.match(ciWorkflow, /^\s*branches:\s*\[main\]\s*$/m);
assert.match(ciWorkflow, /workflow_dispatch:\s+inputs:\s+clean_code_base:/,
  'manual validation must expose an explicit optional clean-code base');
assert.match(ciWorkflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(
  ciWorkflow,
  /concurrency:\s+group:\s*validation-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\s+cancel-in-progress:\s*\$\{\{ github\.ref != 'refs\/heads\/main' \}\}/,
  'a newer validation run must not cancel an in-flight main deployment or its post-deploy evidence',
);

// Each top-level job of ci.yml as text, keyed by job id.
const ciJobs = Object.fromEntries([...ciWorkflow.slice(ciWorkflow.indexOf('\njobs:\n'))
  .matchAll(/^ {2}([a-z][a-z-]*):\n([\s\S]*?)(?=^ {2}[a-z][a-z-]*:\n|(?![\s\S]))/gm)]
  .map(([, id, body]) => [id, body]));
assert.deepEqual(
  Object.keys(ciJobs),
  ['reuse', 'plan', 'build', 'storybook', 'validate', 'test-suites', 'browser-tests', 'browser-quarantine', 'browser-observatory', 'required',
    'refresh-caches', 'deploy-production'],
);

const browserRuntimeAction = readFileSync('.github/actions/browser-runtime/action.yml', 'utf8');
assert.match(browserRuntimeAction, /chrome-runtime-v1-\$\{RUNNER_OS\}-\$\{RUNNER_ARCH\}-\$\{ImageOS\}-\$\{ImageVersion\}-\$\{version\}/,
  'browser caches must match the exact runner image, architecture and installed package');
assert.doesNotMatch(browserRuntimeAction, /restore-keys:/, 'an older browser package must not be selected');
assert.match(browserRuntimeAction, /lookup-only: \$\{\{ inputs.save-cache == 'true' \}\}/);
assert.match(browserRuntimeAction, /if: inputs.save-cache != 'true' && steps.cache.outcome == 'success' && steps.cache.outputs.cache-hit == 'true'/,
  'only a consumer with an exact cache hit may select cached executables');
assert.match(ciJobs.build, /name: Seed installed browser cache\n\s+uses: \.\/\.github\/actions\/browser-runtime\n\s+with:\n\s+save-cache: 'true'/);
assert.match(ciJobs['refresh-caches'], /name: Seed installed browser cache\n\s+uses: \.\/\.github\/actions\/browser-runtime\n\s+with:\n\s+save-cache: 'true'/,
  'main refresh seeds the default-branch cache when the build was reused');
for (const job of ['test-suites', 'browser-tests', 'browser-quarantine', 'browser-observatory']) {
  assert.match(ciJobs[job], /name: Restore installed browser runtime\n\s+uses: \.\/\.github\/actions\/browser-runtime/);
}

// Execute the action's selection step: absent or mismatched caches must leave
// the system browser and its existing preload setting intact.
const selectBrowserScript = browserRuntimeAction.split('    - name: Select restored Chrome\n')[1]
  .split('      run: |\n')[1].split('\n').map(line => line.slice(8)).join('\n');
const browserCacheRoot = mkdtempSync(join(tmpdir(), 'browser-cache-contract-'));
try {
  const browserDirectory = join(browserCacheRoot, 'hp-browser-runtime');
  const githubEnvironment = join(browserCacheRoot, 'github-env');
  const expectedVersion = '150.0.0.1-1';
  const trustedHelper = join(browserCacheRoot, 'system-chrome-sandbox');
  const fixtureBin = join(browserCacheRoot, 'bin');
  mkdirSync(fixtureBin);
  // Simulate root ownership without elevating the test or any fixture binary.
  writeFileSync(join(fixtureBin, 'stat'), '#!/bin/sh\nprintf \'%s\\n\' "$TEST_SANDBOX_STAT"\n', { mode: 0o755 });
  const fixtureScript = selectBrowserScript.replaceAll('/opt/google/chrome/chrome-sandbox', trustedHelper);
  const selectBrowser = (sandboxStat = '0:4755') => {
    writeFileSync(githubEnvironment, 'existing=preserved\n');
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', fixtureScript], {
      env: {
        ...process.env, RUNNER_TEMP: browserCacheRoot, GITHUB_ENV: githubEnvironment,
        PACKAGE_VERSION: expectedVersion, PATH: `${fixtureBin}:${process.env.PATH}`,
        TEST_SANDBOX_STAT: sandboxStat,
      },
    });
    return readFileSync(githubEnvironment, 'utf8');
  };
  assert.equal(selectBrowser(), 'existing=preserved\n', 'a missing cache preserves fallback');
  mkdirSync(browserDirectory);
  for (const executable of ['chrome', 'google-chrome']) {
    writeFileSync(join(browserDirectory, executable), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  assert.equal(selectBrowser(), 'existing=preserved\n', 'an incomplete cache preserves fallback');
  writeFileSync(join(browserDirectory, '.hp-package-version'), '149.0.0.1-1\n');
  assert.equal(selectBrowser(), 'existing=preserved\n', 'a different package preserves fallback');
  writeFileSync(join(browserDirectory, '.hp-package-version'), `${expectedVersion}\n`);
  assert.equal(selectBrowser(), 'existing=preserved\n', 'a missing trusted helper preserves fallback');
  writeFileSync(trustedHelper, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.equal(selectBrowser('1000:4755'), 'existing=preserved\n', 'a user-owned helper preserves fallback');
  assert.equal(selectBrowser('0:755'), 'existing=preserved\n', 'a helper without setuid preserves fallback');
  const restoredHelper = join(browserDirectory, 'chrome-sandbox');
  mkdirSync(restoredHelper);
  assert.equal(selectBrowser(), 'existing=preserved\n', 'a failed helper replacement preserves fallback');
  rmSync(restoredHelper, { recursive: true });
  writeFileSync(restoredHelper, 'untrusted restored helper');
  assert.equal(selectBrowser(), `existing=preserved\nCHROMIUM_PATH=${browserDirectory}/google-chrome\nHP_BROWSER_PRELOAD=0\n`);
  assert.equal(readlinkSync(restoredHelper), trustedHelper, 'sandbox uses the installed package helper');
  assert.match(selectBrowser(), /CHROMIUM_PATH=/, 'selecting the same cache again is safe');
  rmSync(trustedHelper);
  symlinkSync(join(browserDirectory, 'chrome'), trustedHelper);
  assert.equal(selectBrowser(), 'existing=preserved\n', 'a symlink in place of the trusted helper preserves fallback');
} finally {
  rmSync(browserCacheRoot, { recursive: true, force: true });
}

const validationJobs = ['build', 'storybook', 'validate', 'test-suites', 'browser-tests', 'browser-observatory'];
const allValidationSucceeded = validationJobs.map(job => `needs.${job}.result == 'success'`);
assert.match(ciWorkflow, /^ {2}merge_group:\n {4}types: \[checks_requested\]$/m, 'the merge queue runs the same validation');
assert.match(ciJobs.required, /^ {4}name: CI required$/m, 'the merge-queue ruleset requires this exact check name');
assert.match(ciJobs.required, /^ {4}if: always\(\)$/m, 'a failed dependency must fail the check, not skip it');
assert.ok(ciJobs.required.includes(`    needs: [reuse, plan, ${validationJobs.join(', ')}]\n`), 'CI required waits for the plan and every validation job');
assert.ok(ciJobs.required.includes([
  '        run: >-',
  '          test "${{ needs.reuse.outputs.run-id != \'\' || (needs.plan.result == \'success\'',
  '          && needs.build.result == \'success\' && needs.storybook.result == \'success\' && needs.validate.result == \'success\'',
  '          && (needs.test-suites.result == \'success\' || (github.event_name == \'pull_request\' && needs.plan.outputs.registry-shards == \'[]\' && needs.test-suites.result == \'skipped\'))',
  '          && (needs.browser-tests.result == \'success\' || (github.event_name == \'pull_request\' && needs.plan.outputs.browser-shards == \'[]\' && needs.browser-tests.result == \'skipped\'))',
  '          && needs.browser-observatory.result == \'success\') }}" = true',
  '',
].join('\n')), 'CI required: a reused merge-queue validation, or the plan and every validation job succeeded; a test job may be '
  + 'skipped only on a pull request whose plan gave it no shard');

// The plan: only a pull request is narrowed, by scripts/ci-test-plan.mjs.
const planJob = ciJobs.plan;
assert.doesNotMatch(planJob, /^ {4}needs:/m, 'the plan starts at once, beside the build');
assert.match(planJob, /^ {4}timeout-minutes: [1-5]$/m);
assert.ok(planJob.includes([
  '    outputs:',
  '      registry-shards: ${{ steps.plan.outputs.registry-shards }}',
  '      browser-shards: ${{ steps.plan.outputs.browser-shards }}',
  '      affected-tests: ${{ steps.plan.outputs.affected-tests }}',
  '',
].join('\n')));
assert.ok(planJob.includes("          fetch-depth: ${{ github.event_name == 'pull_request' && '0' || '1' }}\n"),
  'a pull request plan needs the history to its merge-base');
assert.ok(planJob.includes([
  '      - name: Plan test shards',
  '        id: plan',
  '        env:',
  '          EVENT_NAME: ${{ github.event_name }}',
  '          BASE_SHA: ${{ github.event.pull_request.base.sha }}',
  '          HEAD_SHA: ${{ github.event.pull_request.head.sha }}',
  '        run: node scripts/ci-test-plan.mjs --event "$EVENT_NAME" --base "$BASE_SHA" --head "$HEAD_SHA"',
  '',
].join('\n')));
assert.doesNotMatch(planJob, /continue-on-error/, 'a failed plan fails CI required instead of testing nothing');
for (const event of ['merge_group', 'push', 'workflow_dispatch']) {
  assert.deepEqual(planTestShards({ event, status: 0, output: '{"mode":"none","files":{}}', registry: { suites: [] } }), {
    mode: 'all',
    reason: `${event} always runs every test`,
    registryShards: [1, 2, 3, 4],
    browserShards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    affectedTests: '',
  }, `${event} runs the full matrices`);
}
for (const [job, shards] of [['test-suites', 'registry-shards'], ['browser-tests', 'browser-shards']]) {
  assert.ok(ciJobs[job].includes(`      matrix:\n        shard: \${{ fromJSON(needs.plan.outputs.${shards}) }}\n`),
    `${job} takes its shards from the plan`);
  assert.ok(ciJobs[job].includes('        env:\n          AFFECTED_TESTS: ${{ needs.plan.outputs.affected-tests }}\n        run: |\n'),
    `${job} receives the engine's selection unchanged`);
}

// A push of a commit the merge queue already validated reuses that run.
assert.match(ciJobs.reuse, /^ {4}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m,
  'only a push to main may reuse another run');
assert.match(ciJobs.reuse, /permissions:\n {6}actions: read\n {6}contents: read\n/);
assert.match(ciJobs.reuse, /run-id: \$\{\{ steps\.find\.outputs\.run-id \}\}/);
assert.match(ciJobs.reuse, /GITHUB_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/find-validated-release\.mjs$/m);
for (const job of ['build', 'storybook', 'validate']) {
  assert.ok(ciJobs[job].includes("    needs: reuse\n    if: ${{ !cancelled() && needs.reuse.outputs.run-id == '' }}\n"),
    `${job} validates whenever no merge-queue run is reused, including when the lookup itself failed`);
}
assert.match(ciJobs['refresh-caches'], /^ {4}if: needs\.reuse\.outputs\.run-id != ''$/m);
assert.doesNotMatch(ciJobs['refresh-caches'], /upload-artifact|release:create/, 'the cache refresh never produces a release');
assert.ok(ciJobs.validate.includes('CLEAN_CODE_BASE: ${{ github.event.merge_group.base_sha }}'));
assert.ok(ciJobs.validate.includes('REACT_DOCTOR_BASE: ${{ github.event.merge_group.base_sha }}'));
assert.ok(ciJobs['test-suites'].includes('name: next-bundle-measurements-${{ github.sha }}'),
  'the job that runs the bundle budget test publishes its measurements');
for (const [id, body] of Object.entries(ciJobs)) {
  assert.match(body, /^ {4}timeout-minutes: \d+$/m, `${id} must bound its runtime`);
}
assert.match(ciJobs.build, /^ {4}timeout-minutes: 15$/m);
assert.match(ciJobs.validate, /^ {4}timeout-minutes: 15$/m);
assert.match(ciJobs['test-suites'], /^ {4}timeout-minutes: 15$/m);
assert.match(ciJobs['browser-tests'], /^ {4}timeout-minutes: 15$/m);
assert.match(ciJobs.storybook, /^ {4}timeout-minutes: 10$/m);

// The hosted jobs split `npm run verify:release` without dropping a command:
// static checks, one build, and the registry suites run in parallel jobs.
const packageScripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
const npmCommands = script => packageScripts[script].split(' && ').map(command => command.trim());
const releaseCommands = npmCommands('verify:release');
const checkCommands = npmCommands('verify:release:checks');
const buildCommands = npmCommands('verify:release:build');
assert.deepEqual(
  [...checkCommands, ...buildCommands, 'npm run build-storybook', 'npm test'].sort(),
  [...releaseCommands].sort(),
  'CI phases must run exactly the verify:release commands',
);
assert.match(ciJobs.storybook, /- name: Build Storybook\s+run: npm run build-storybook$/m);
for (const phase of [checkCommands, buildCommands]) {
  assert.deepEqual(releaseCommands.filter(command => phase.includes(command)), phase,
    'each CI phase keeps the verify:release order');
}
assert.match(ciJobs.validate, /- name: Run release-blocking static checks\s+run: npm run verify:release:checks$/m);
assert.match(ciJobs.validate, /fetch-depth: 0/, 'the clean-code gate needs the diff base history');
assert.match(ciJobs.validate, /run: npm audit --omit=dev --audit-level=critical/);
assert.match(ciJobs.build, /- name: Build and smoke-test release inputs\s+run: npm run verify:release:build$/m);
assert.ok(ciJobs.build.includes("HP_CI_SEPARATE_NEXT_TYPES: '1'"));
assert.ok(packageScripts['verify:release:checks'].includes('npm run lint:next:authoritative'),
  'skipping the duplicate build check requires the same compiler in the required static gate');
for (const [id, body] of Object.entries(ciJobs)) {
  if (id === 'build') continue;
  assert.doesNotMatch(body, /npm run (?:verify:release:build|release:create)\b/, `${id} must not package a second release`);
  if (id === 'refresh-caches') continue;
  assert.doesNotMatch(body, /npm run build(?![\w:-])/, `${id} must not build a second release`);
}
assert.match(ciJobs['browser-observatory'], /run: node scripts\/browser-qa-batch.mjs \$\{\{ matrix\.batch \}\}/);
assert.match(ciJobs['browser-observatory'], /^ {4}needs: \[reuse, build\]$/m);
assert.ok(ciJobs['browser-observatory'].includes("needs.build.result == 'success'"));
assert.ok(ciJobs['browser-observatory'].includes('name: build-outputs-${{ github.sha }}'));

const buildOutputsName = 'name: build-outputs-${{ github.sha }}';
assert.match(ciJobs.build, /- name: Upload validated build outputs\s+uses: actions\/upload-artifact@v7/);
const packOutputs = ciJobs.build.match(/- name: Pack validated build outputs\n {8}run: (.+)\n/)?.[1];
assert.ok(packOutputs, 'validated outputs must be packaged before upload');
assert.ok(ciJobs.build.includes('path: ${{ runner.temp }}/build-outputs.tar.gz'));
assert.match(ciJobs.build, /compression-level: 0\n {10}if-no-files-found: error/,
  'the artifact service must not recompress the gzip payload');
assert.match(ciJobs.build, /retention-days: 3\s+# [^\n]+\s+overwrite: true/);
const unpackOutputs = [];
for (const job of ['test-suites', 'browser-tests', 'browser-quarantine', 'browser-observatory']) {
  assert.ok(ciJobs[job].includes(buildOutputsName + '\n          path: ${{ runner.temp }}/build-outputs'));
  const unpack = ciJobs[job].match(/- name: Extract validated build outputs\n {8}run: (.+)\n/)?.[1];
  assert.ok(unpack, `${job} must extract outputs before running tests`);
  assert.ok(ciJobs[job].indexOf('- name: Download validated build outputs') < ciJobs[job].indexOf('- name: Extract validated build outputs'));
  assert.ok(ciJobs[job].indexOf('- name: Extract validated build outputs') < ciJobs[job].indexOf('- name: Run '));
  unpackOutputs.push(unpack);
}
assert.equal(new Set(unpackOutputs).size, 1, 'every consumer restores the same archive');
// Execute the actual workflow commands in isolation, including hidden outputs
// and a cache sentinel, so path/exclusion drift cannot silently lose inputs.
const archiveFixture = mkdtempSync(join(tmpdir(), 'ci-build-archive-'));
try {
  const source = join(archiveFixture, 'source');
  const restored = join(archiveFixture, 'restored');
  const runnerTemp = join(archiveFixture, 'runner temp');
  for (const dir of [source, restored, join(runnerTemp, 'build-outputs')]) mkdirSync(dir, { recursive: true });
  const fixtures = new Map([
    ['build/backend.js', 'compiled backend'],
    ['dist/.hidden/output.js', 'hidden output'],
    ['apps/public-web/.next/BUILD_ID', 'validated build'],
    ['apps/public-web/.next/server/app/with space.html', '<html>fixture</html>'],
  ]);
  for (const [path, content] of [...fixtures, ['apps/public-web/.next/cache/excluded', 'cache']]) {
    const file = join(source, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, { mode: 0o640 });
  }
  const env = { ...process.env, RUNNER_TEMP: runnerTemp };
  execFileSync('bash', ['-e', '-o', 'pipefail', '-c', packOutputs], { cwd: source, env });
  const archive = join(runnerTemp, 'build-outputs.tar.gz');
  writeFileSync(join(runnerTemp, 'build-outputs/build-outputs.tar.gz'), readFileSync(archive));
  execFileSync('bash', ['-e', '-o', 'pipefail', '-c', unpackOutputs[0]], { cwd: restored, env });
  for (const [path, content] of fixtures) {
    assert.equal(readFileSync(join(restored, path), 'utf8'), content);
    assert.equal(statSync(join(restored, path)).mode & 0o777, statSync(join(source, path)).mode & 0o777);
  }
  assert.throws(() => statSync(join(restored, 'apps/public-web/.next/cache')), { code: 'ENOENT' });
  rmSync(join(source, 'dist'), { recursive: true });
  assert.throws(() => execFileSync('bash', ['-e', '-o', 'pipefail', '-c', packOutputs],
    { cwd: source, env, stdio: 'pipe' }), 'missing required output must fail packaging');
} finally {
  rmSync(archiveFixture, { recursive: true, force: true });
}
assert.match(ciJobs.build, /retention-days: 7\s+compression-level: 6\s+# [^\n]+\s+overwrite: true\s+# [^\n]+\s+include-hidden-files: true/,
  'a full re-run on main can repackage the release of the same SHA');
const releaseEvents = "if: (github.event_name == 'push' && github.ref == 'refs/heads/main') || github.event_name == 'merge_group'";
for (const step of ['Create immutable production release', 'Upload immutable production release']) {
  assert.ok(ciJobs.build.includes(`- name: ${step}\n        ${releaseEvents}\n`),
    `${step} runs for a push to main and in the merge queue, whose release that push may reuse`);
}
assert.match(ciJobs.storybook, /name: storybook-static-\$\{\{ github\.sha \}\}\n {10}path: storybook-static\n/);
for (const [job, shards] of [['test-suites', 'registry-shards'], ['browser-tests', 'browser-shards']]) {
  const storybookDependency = job === 'browser-tests' ? ', storybook' : '';
  const storybookCondition = job === 'browser-tests' ? " && needs.storybook.result == 'success'" : '';
  assert.ok(ciJobs[job].includes(`    needs: [plan, build${storybookDependency}]\n`),
    `${job} waits only for the artifacts it consumes`);
  assert.ok(ciJobs[job].includes(`    if: \${{ !cancelled() && needs.plan.result == 'success' && needs.plan.outputs.${shards} != '[]' && needs.build.result == 'success'${storybookCondition} }}\n`),
    `${job} runs after its required inputs, even with skipped reuse, unless its plan is empty`);
  assert.ok(ciJobs[job].includes(buildOutputsName), `${job} must download the validated build outputs`);
  if (job === 'browser-tests') {
    assert.match(ciJobs[job], /name: storybook-static-\$\{\{ github\.sha \}\}\n {10}path: storybook-static\n/);
  } else {
    assert.doesNotMatch(ciJobs[job], /storybook/, 'registry jobs neither wait for nor download unused Storybook outputs');
  }
  for (const step of ciJobs[job].split(/^ {6}- name: /m)) {
    if (!step.startsWith('Upload test timings\n')) {
      assert.doesNotMatch(step, /continue-on-error/, `${job} failures must block production`);
    }
  }
  assert.match(ciJobs[job], /strategy:\n(?: {6}#[^\n]*\n)? {6}fail-fast: false\n/,
    'a failing shard must not cancel and hide the other shards');
}
// PRs retain one isolated cache per lockfile/config; immutable hits are not saved again.
for (const job of ['build', 'refresh-caches']) {
  assert.match(ciJobs[job], /uses: actions\/cache\/restore@v6\n {8}with:\n {10}path: apps\/public-web\/\.next\/cache\n/);
}
assert.ok(ciJobs.build.includes("if: steps.next-cache.outputs.cache-hit != 'true' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch' || github.event_name == 'pull_request')"));
assert.ok(ciJobs.build.includes("format('pr-{0}-{1}', github.event.pull_request.number, hashFiles('apps/public-web/next.config.mjs'))"),
  'a PR does not create a large cache for every commit');
assert.ok(ciJobs.build.includes('key: ${{ steps.next-cache.outputs.cache-primary-key }}'),
  'the save uses the exact key computed by restore');
assert.doesNotMatch(ciJobs['browser-observatory'], /actions\/cache\/save/);
assert.ok(ciJobs.build.indexOf('- name: Build and smoke-test release inputs') < ciJobs.build.indexOf('- name: Pack validated build outputs'));
assert.ok(ciJobs.build.indexOf('- name: Pack validated build outputs') < ciJobs.build.indexOf('- name: Upload validated build outputs'));
const releaseCreateIndex = ciJobs.build.indexOf('- name: Create immutable production release');
assert.ok(ciJobs.build.indexOf('- name: Build and smoke-test release inputs') < ciJobs.build.indexOf('- name: Upload validated build outputs'));
assert.ok(ciJobs.build.indexOf('- name: Upload validated build outputs') < releaseCreateIndex,
  'the release is packaged from the outputs the test jobs receive');
assert.ok(ciJobs.build.includes('hs-arena-release-${{ github.sha }}'), 'only the build job packages the release');
assert.match(ciJobs['test-suites'], /sudo apt-get install -y --no-install-recommends nginx openssl/,
  'the identity TLS and nginx regression tests need the system tools');

// The registry suites: browser and everything else run in two sharded matrices.
const onlyFilesRun = command => [
  '        run: |',
  '          # A narrowed pull request runs only the planned files: the engine\'s selection, unchanged.',
  '          only_files=()',
  '          if [ -n "$AFFECTED_TESTS" ]; then',
  '            printf \'%s\\n\' "$AFFECTED_TESTS" > "$RUNNER_TEMP/affected-tests.json"',
  '            only_files=(--only-files "$RUNNER_TEMP/affected-tests.json")',
  '          fi',
  `          ${command} "\${only_files[@]}"`,
  '',
].join('\n');
const suiteRun = ciJobs['test-suites'].match(/^ {10}node scripts\/run-test-workers.mjs --suite ([a-z,-]+) --shard /m)?.[1];
assert.ok(suiteRun, 'the non-browser shards must run registry suites');
assert.ok(ciJobs['test-suites'].includes(onlyFilesRun(
  `node scripts/run-test-workers.mjs --suite ${suiteRun} --shard \${{ matrix.shard }}/\${{ strategy.job-total }} --continue-on-failure --workers 2 --report-dir "$RUNNER_TEMP/test-timings"`,
)), 'the non-browser shards derive the total from the matrix and run only the planned files');
assert.ok(suiteRun, 'the non-browser shards must run registry suites and derive the total from the matrix');
assert.deepEqual([...suiteRun.split(','), 'browser'].sort(), [...TEST_SUITE_IDS].sort(),
  'every registry suite runs in exactly one job');
assert.deepEqual(FULL_SHARDS, { registry: 4, browser: 10 },
  'a full run has four registry jobs and ten browser jobs, with bounded isolated workers');
for (const job of ['browser-tests', 'browser-observatory']) {
  assert.ok(ciJobs[job].includes("HP_BROWSER_PRELOAD: '1'"),
    `${job} measures the bounded executable preload experiment`);
}
assert.ok(
  ciJobs['browser-tests'].includes(onlyFilesRun(
    'node scripts/run-test-workers.mjs --suite browser --shard ${{ matrix.shard }}/${{ strategy.job-total }} --retry-failed-once --continue-on-failure --quarantine exclude --workers 4 --warmup-browser --report-dir "$RUNNER_TEMP/test-timings"',
  )),
  'shards derive the total from the matrix, retry a failing file exactly once, report every failure and skip the quarantine',
);
// Quarantined flaky tests run on every event in their own job that never gates
// CI required or the deployment (both need lists are asserted exactly above).
const quarantineJob = ciJobs['browser-quarantine'];
assert.match(quarantineJob, /^ {4}name: Browser quarantine \(non-blocking\)$/m);
assert.match(quarantineJob, /^ {4}needs: \[build, storybook, required\]$/m, 'quarantine uses built outputs after the blocking gate to leave runner slots for validation');
assert.match(quarantineJob, /^ {4}continue-on-error: true$/m, 'a quarantine failure never fails the run');
const quarantineIf = quarantineJob.match(/^ {4}if: (.+)$/m)?.[1];
assert.ok(quarantineIf, 'the quarantine job needs an explicit if');
assert.ok(quarantineIf.includes("!cancelled() && ") && quarantineIf.includes("needs.build.result == 'success' && needs.storybook.result == 'success'"),
  'the quarantine job runs after both builds even though the reuse job upstream was skipped');
// Flake data comes from pull requests: the merge queue and main must not pay runner minutes for the quarantine.
assert.ok(quarantineIf.includes("github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'"),
  'the quarantine job runs only for pull_request and workflow_dispatch');
assert.ok(!/merge_group|github\.event_name == 'push'/.test(quarantineIf), 'the quarantine job never runs in merge_group or on push');
assert.ok(quarantineJob.includes(buildOutputsName), 'the quarantine job must download the validated build outputs');
assert.match(quarantineJob, /name: storybook-static-\$\{\{ github\.sha \}\}\n {10}path: storybook-static\n/,
  'quarantined archetype and skeleton tests serve the Storybook build');
assert.match(quarantineJob, /- name: Run quarantined browser tests\n {8}run: npm run test:suite -- browser --retry-failed-once --continue-on-failure --quarantine only --report "\$RUNNER_TEMP\/test-timings.json"$/m);
for (const [job, artifact] of [['test-suites', 'registry-${{ matrix.shard }}'], ['browser-tests', 'browser-${{ matrix.shard }}'], ['browser-quarantine', 'quarantine']]) {
  assert.match(ciJobs[job], /- name: Upload test timings\n {8}if: always\(\)\n {8}continue-on-error: true/,
    'timings survive test failures and their upload never changes the test outcome');
  assert.ok(ciJobs[job].includes(`name: test-timings-${artifact}`));
  assert.ok(ciJobs[job].includes(`path: \${{ runner.temp }}/test-timings${job === 'browser-quarantine' ? '.json' : ''}`));
}
assert.ok(!validationJobs.includes('browser-quarantine'));
assert.equal(packageScripts['test:suite'], 'node scripts/test-suite-runner.mjs --suite');
const testRegistry = JSON.parse(readFileSync('tests/test-suites.json', 'utf8'));
const testDurations = validateTestDurations(JSON.parse(readFileSync('tests/test-durations.json', 'utf8')));
const quarantined = new Set((testRegistry.quarantine ?? []).map(entry => entry.file));
const browserFiles = testRegistry.suites.find(suite => suite.id === 'browser').files;
assert.ok([...quarantined].every(file => browserFiles.includes(file)), 'only browser tests run in the browser quarantine job');
for (const [suiteIds, shardCount] of [[['browser'], FULL_SHARDS.browser], [suiteRun.split(','), FULL_SHARDS.registry]]) {
  const files = testRegistry.suites.filter(suite => suiteIds.includes(suite.id)).flatMap(suite => suite.files)
    .filter(file => !quarantined.has(file));
  assert.deepEqual([...planShards(files, shardCount, testDurations).flat()].sort(), [...files].sort(),
    `the ${suiteIds.join(',')} shards together run every registered unquarantined file exactly once`);
}
assert.match(ciWorkflow, /CLEAN_CODE_EVENT:\s*\$\{\{ github\.event_name \}\}/);
assert.match(ciWorkflow, /CLEAN_CODE_PUSH_BEFORE:\s*\$\{\{ github\.event\.before \}\}/);
assert.match(ciWorkflow, /CLEAN_CODE_PR_BASE_SHA:\s*\$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
assert.match(ciWorkflow, /CLEAN_CODE_DISPATCH_BASE:\s*\$\{\{ inputs\.clean_code_base \}\}/);
assert.match(ciJobs['browser-observatory'], /^ {4}name: Full browser observatory \(batch \$\{\{ matrix\.batch \}\}\)$/m);
assert.match(ciJobs['browser-observatory'], /^ {4}timeout-minutes: 15$/m);
assert.match(ciJobs['browser-observatory'], /^ {8}batch: \[1, 2, 3, 4\]$/m);
assert.doesNotMatch(ciJobs['browser-observatory'], /npm run qa:ci|actions\/cache\/restore/,
  'the observatory tests the validated artifact without rebuilding it');
assert.match(
  ciWorkflow,
  /browser-observatory:[\s\S]*?env:\s+PUPPETEER_SKIP_DOWNLOAD:\s*'true'\s+CHROMIUM_PATH:\s*'\/usr\/bin\/google-chrome'/,
  'hosted browser QA must use the installed Chrome binary instead of the slow Chromium wrapper',
);
assert.doesNotMatch(
  ciWorkflow,
  /browser-observatory:[\s\S]*?continue-on-error:\s*true[\s\S]*?deploy-production:/,
  'browser observatory failures must block production deployment',
);
assert.match(
  ciWorkflow,
  /- name:\s*Run full browser observatory\s+run:\s*node scripts\/browser-qa-batch.mjs/,
  'every observatory batch must run against the downloaded Next.js release',
);
assert.match(ciWorkflow, /npm run release:create -- --output="\$RUNNER_TEMP\/release-\$GITHUB_SHA" --sha="\$GITHUB_SHA"/);
assert.match(ciWorkflow, /actions\/upload-artifact@v7/);
assert.match(ciWorkflow, /name: Upload immutable production release[\s\S]*?include-hidden-files:\s*true/,
  'the immutable artifact must include the hidden Next build directory');
assert.match(ciWorkflow, /name:\s*hs-arena-release-\$\{\{ github\.sha \}\}/);
assert.match(ciWorkflow, /if-no-files-found:\s*error/);
assert.match(ciWorkflow, /retention-days:\s*7/);
assert.match(ciWorkflow, /^\s*deploy-production:\s*$/m);
assert.ok(ciJobs['deploy-production'].includes(`    needs: [reuse, ${validationJobs.join(', ')}]\n`),
  'production waits for every validation job');
const deployCondition = ciJobs['deploy-production'].match(/^ {4}if: >-\n((?: {6}.*\n)+)/m)?.[1].replace(/\s+/g, ' ').trim();
assert.equal(deployCondition, `\${{ !cancelled() && github.event_name == 'push' && github.ref == 'refs/heads/main' && ((needs.reuse.result == 'success' && needs.reuse.outputs.run-id != '') || (${allValidationSucceeded.join(' && ')})) }}`,
  'production deploys only a release validated in full, here or by the merge queue for this exact commit');
assert.match(ciJobs['deploy-production'], /run-id: \$\{\{ needs\.reuse\.outputs\.run-id \|\| github\.run_id \}\}\n {10}github-token: \$\{\{ github\.token \}\}\n/);
assert.match(ciJobs['deploy-production'], /permissions:\n {6}actions: read\n {6}contents: read\n/);
assert.match(ciWorkflow, /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
assert.match(ciWorkflow, /runs-on:\s*\[self-hosted,\s*linux,\s*x64,\s*hs-arena-production\]/);
assert.match(ciWorkflow, /environment:\s*\n\s*name:\s*production\s*\n\s*url:\s*https:\/\/hearthpulse\.net/);
assert.match(ciWorkflow, /group:\s*hs-arena-production/);
assert.match(ciWorkflow, /cancel-in-progress:\s*false/);
const productionJob = ciWorkflow.slice(ciWorkflow.indexOf('  deploy-production:'));
const helperPreflightIndex = productionJob.indexOf('- name: Verify installed deploy helper contract');
const artifactDownloadIndex = productionJob.indexOf('- name: Download validated release');
assert.ok(helperPreflightIndex >= 0, 'production must verify the installed helper contract');
assert.ok(
  helperPreflightIndex < artifactDownloadIndex,
  'helper contract drift must fail before the release artifact is downloaded',
);
const helperPreflight = productionJob.slice(helperPreflightIndex, artifactDownloadIndex);
assert.match(helperPreflight, /run:\s*bash deploy\/install-hs-arena-deployer\.sh --check/);
assert.doesNotMatch(helperPreflight, /\bsudo\b|--install/, 'CI preflight must remain read-only');
assert.match(
  productionJob,
  /uses:\s*actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\s*# v7\.0\.1/,
);
assert.match(
  productionJob,
  /uses:\s*actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020\s*# v7\.0\.0/,
);
assert.match(
  productionJob,
  /uses:\s*actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c\s*# v8\.0\.1/,
);
assert.doesNotMatch(productionJob, /uses:\s*[^\s@]+@v\d+/);
assert.match(
  ciWorkflow,
  /sudo \/usr\/local\/sbin\/hs-arena-ci-deploy --require-capability=scraper-runtime-probe-v1 --allow-nginx-contract-hash=cbbc3ec16dbf11ca08f3b21832c9475acff21afb3776cd0422a0da42097defed "\$artifact" "\$GITHUB_SHA"/,
  'production must fail closed unless the installed privileged deployer advertises the browser smoke capability',
);
assert.doesNotMatch(
  ciWorkflow,
  /^\s*post-deploy-production:\s*$/m,
  'post-deploy checks must retain the deployment concurrency lock in the deploy job',
);
assert.match(ciWorkflow, /PRODUCTION_MONITOR_PROFILE:\s*release/);
assert.match(ciWorkflow, /EXPECTED_RELEASE_SHA:\s*\$\{\{ github\.sha \}\}/);
assert.match(ciWorkflow, /PRODUCTION_MONITOR_PROFILE:\s*freshness/);
assert.match(
  ciWorkflow,
  /Deploy exact validated SHA[\s\S]*Verify exact release availability[\s\S]*Observe data freshness separately/,
  'post-deploy checks must run after the exact release is switched',
);
assert.match(
  ciWorkflow,
  /- name:\s*Observe data freshness separately\s+if:\s*always\(\) && steps\.deployment\.outcome == 'success'\s+continue-on-error:\s*true/,
  'freshness degradation must remain visible without classifying a healthy release as broken',
);
assert.doesNotMatch(ciWorkflow, /\b(?:rsync|scp)\b/i);
assert.doesNotMatch(ciWorkflow, /contents:\s*write/);

assert.match(mobileVisualWorkflow, /name:\s*Full responsive visual QA/);
assert.match(mobileVisualWorkflow, /^\s*schedule:\s*$/m);
assert.match(mobileVisualWorkflow, /^\s*- cron:\s*'17 3 \* \* \*'\s*$/m);
assert.match(mobileVisualWorkflow, /^\s*workflow_dispatch:\s*$/m);
assert.doesNotMatch(mobileVisualWorkflow, /^\s*(?:push|pull_request):/m);
assert.match(mobileVisualWorkflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(mobileVisualWorkflow, /group:\s*mobile-visual-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/);
assert.match(mobileVisualWorkflow, /cancel-in-progress:\s*true/);
assert.match(mobileVisualWorkflow, /timeout-minutes:\s*40/);
assert.match(mobileVisualWorkflow, /PUPPETEER_SKIP_DOWNLOAD:\s*'true'/);
assert.match(mobileVisualWorkflow, /QA_RESPONSIVE_SCOPE:\s*all-p0/);
assert.match(
  mobileVisualWorkflow,
  /- name:\s*Run full responsive visual QA\s+env:\s+QA_SCREENSHOT_DIR:\s*\$\{\{ runner\.temp \}\}\/mobile-visual-qa\s+run:\s*npm run qa:responsive:all/,
);
assert.match(mobileVisualWorkflow, /actions\/checkout@v7/);
assert.match(mobileVisualWorkflow, /actions\/setup-node@v7/);
assert.match(mobileVisualWorkflow, /node-version:\s*'22'/);
assert.match(mobileVisualWorkflow, /run:\s*npm ci/);
assert.match(mobileVisualWorkflow, /run:\s*npm run qa:responsive:all/);
assert.match(mobileVisualWorkflow, /if:\s*always\(\)/);
assert.match(mobileVisualWorkflow, /actions\/upload-artifact@v7/);
assert.match(mobileVisualWorkflow, /name:\s*responsive-qa-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
assert.match(mobileVisualWorkflow, /mobile-visual-qa\/responsive-manifest\.json/);
assert.match(mobileVisualWorkflow, /mobile-visual-qa\/responsive-\*\.png/);
assert.match(mobileVisualWorkflow, /if-no-files-found:\s*error/);
assert.match(mobileVisualWorkflow, /retention-days:\s*14/);
assert.match(mobileVisualWorkflow, /compression-level:\s*0/);
assert.doesNotMatch(mobileVisualWorkflow, /\bgit\s+(?:add|commit|push)\b/);
assert.doesNotMatch(mobileVisualWorkflow, /contents:\s*write/);
assert.doesNotMatch(mobileVisualWorkflow, /\b(?:deploy|rsync|scp)\b/i);
assert.doesNotMatch(mobileVisualWorkflow, /actions\/(?:checkout|setup-node|upload-artifact)@v[1-5]\b/);

assert.match(productionMonitorWorkflow, /name:\s*Production SEO and stability monitor/);
assert.match(productionMonitorWorkflow, /^\s*schedule:\s*$/m);
assert.match(productionMonitorWorkflow, /^\s*- cron:\s*'\*\/5 \* \* \* \*'\s*$/m);
assert.match(productionMonitorWorkflow, /^\s*workflow_dispatch:\s*$/m);
assert.doesNotMatch(productionMonitorWorkflow, /^\s*(?:push|pull_request):/m);
assert.match(productionMonitorWorkflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(productionMonitorWorkflow, /group:\s*production-monitor/);
assert.match(productionMonitorWorkflow, /cancel-in-progress:\s*true/);
assert.match(productionMonitorWorkflow, /timeout-minutes:\s*5/);
assert.match(productionMonitorWorkflow, /actions\/checkout@v7/);
assert.match(productionMonitorWorkflow, /actions\/setup-node@v7/);
assert.match(productionMonitorWorkflow, /node-version:\s*'22'/);
assert.match(productionMonitorWorkflow, /PRODUCTION_BASE_URL:\s*https:\/\/hearthpulse\.net/);
assert.match(productionMonitorWorkflow, /MONITOR_ATTEMPTS:\s*'2'/);
assert.match(productionMonitorWorkflow, /MONITOR_RETRY_DELAY_MS:\s*'5000'/);
assert.match(productionMonitorWorkflow, /MONITOR_TIMEOUT_MS:\s*'10000'/);
assert.match(productionMonitorWorkflow, /MONITOR_DEADLINE_MS:\s*'240000'/);
assert.match(productionMonitorWorkflow, /run:\s*node scripts\/production-monitor\.mjs/);
assert.doesNotMatch(productionMonitorWorkflow, /\bgit\s+(?:add|commit|push)\b/);
assert.doesNotMatch(productionMonitorWorkflow, /contents:\s*write/);
assert.doesNotMatch(productionMonitorWorkflow, /\b(?:deploy|rsync|scp)\b/i);
assert.doesNotMatch(productionMonitorWorkflow, /actions\/(?:checkout|setup-node)@v[1-5]\b/);

assert.match(deployment, /shared\/server-data/);
assert.match(deployment, /hs-arena-scraper\.timer/);
assert.match(deployment, /push to `main`/i);
assert.match(deployment, /hs-arena-production/);
assert.match(deployment, /\/usr\/local\/sbin\/hs-arena-ci-deploy/);
assert.match(runnerSudoers, /^github-runner ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/hs-arena-ci-deploy \*$/m);
assert.doesNotMatch(runnerSudoers, /NOPASSWD:\s*ALL/);
assert.match(
  scraperService,
  /^EnvironmentFile=-\/etc\/hs-arena\/browser-runtime\.env$/m,
  'the scraper service and release probe must share the same non-secret browser configuration',
);

// The deployer refuses a release whose nginx contract differs from the hash
// CI approves, so a change to any contract file must update that hash in the
// same commit. Recompute it the way scripts/create-release.mjs does.
const releaseScript = readFileSync('scripts/create-release.mjs', 'utf8');
const contractBlock = releaseScript.match(/const nginxContractDefinitions = (\[[\s\S]*?\n\]);/)?.[1];
assert.ok(contractBlock, 'the release script must keep its nginx contract list');
const contractFiles = [...contractBlock.matchAll(
  /\{ source: '([^']+)', installPath: '([^']+)', roles: \[([^\]]*)\] \}/g,
)].map(([, source, installPath, roles]) => ({ source, installPath, roles: roles.replace(/['\s]/g, '') }));
assert.ok(contractFiles.length > 0);
const contractHash = createHash('sha256').update(contractFiles.map(file => `${file.source}\0${file.installPath}\0${file.roles}\0${
  createHash('sha256').update(readFileSync(file.source)).digest('hex')}\n`).join('')).digest('hex');
assert.match(ciWorkflow, new RegExp(`--allow-nginx-contract-hash=${contractHash} `),
  `the approved nginx contract hash in ci.yml must match the contract files (${contractHash})`);

console.log('workflow ownership contracts passed');
