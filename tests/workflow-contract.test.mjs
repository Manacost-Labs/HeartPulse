import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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
  ['reuse', 'build', 'storybook', 'validate', 'test-suites', 'browser-tests', 'browser-quarantine', 'browser-observatory', 'required',
    'refresh-caches', 'deploy-production'],
);
const validationJobs = ['build', 'storybook', 'validate', 'test-suites', 'browser-tests', 'browser-observatory'];
const allValidationSucceeded = validationJobs.map(job => `needs.${job}.result == 'success'`);
assert.match(ciWorkflow, /^ {2}merge_group:\n {4}types: \[checks_requested\]$/m, 'the merge queue runs the same validation');
assert.match(ciJobs.required, /^ {4}name: CI required$/m, 'the merge-queue ruleset requires this exact check name');
assert.match(ciJobs.required, /^ {4}if: always\(\)$/m, 'a failed dependency must fail the check, not skip it');
assert.ok(ciJobs.required.includes(`    needs: [reuse, ${validationJobs.join(', ')}]\n`), 'CI required waits for every validation job');
assert.ok(ciJobs.required.includes(
  `test "\${{ needs.reuse.outputs.run-id != '' || (${allValidationSucceeded.join(' && ')}) }}" = true`,
), 'only an all-success set of validation jobs, or a reused merge-queue validation of this commit, satisfies CI required');

// A push of a commit the merge queue already validated reuses that run.
assert.match(ciJobs.reuse, /^ {4}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m,
  'only a push to main may reuse another run');
assert.match(ciJobs.reuse, /permissions:\n {6}actions: read\n {6}contents: read\n/);
assert.match(ciJobs.reuse, /run-id: \$\{\{ steps\.find\.outputs\.run-id \}\}/);
assert.match(ciJobs.reuse, /GITHUB_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/find-validated-release\.mjs$/m);
for (const job of ['build', 'storybook', 'validate', 'browser-observatory']) {
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
for (const [id, body] of Object.entries(ciJobs)) {
  if (id === 'build') continue;
  assert.doesNotMatch(body, /npm run (?:verify:release:build|release:create)\b/, `${id} must not package a second release`);
  if (id === 'refresh-caches') continue;
  assert.doesNotMatch(body, /npm run build(?![\w:-])/, `${id} must not build a second release`);
}
assert.match(ciJobs['browser-observatory'], /run: npm run qa:ci/);

const buildOutputsName = 'name: build-outputs-${{ github.sha }}';
assert.match(ciJobs.build, /- name: Upload validated build outputs\s+uses: actions\/upload-artifact@v7/);
for (const directory of ['build', 'dist', 'apps/public-web/.next', '!apps/public-web/.next/cache']) {
  assert.match(ciJobs.build, new RegExp(`^ {12}${directory.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, 'm'));
}
assert.match(ciJobs.build, /retention-days: 3\s+# [^\n]+\s+overwrite: true\s+include-hidden-files: true/);
assert.match(ciJobs.build, /retention-days: 7\s+compression-level: 6\s+# [^\n]+\s+overwrite: true\s+# [^\n]+\s+include-hidden-files: true/,
  'a full re-run on main can repackage the release of the same SHA');
const releaseEvents = "if: (github.event_name == 'push' && github.ref == 'refs/heads/main') || github.event_name == 'merge_group'";
for (const step of ['Create immutable production release', 'Upload immutable production release']) {
  assert.ok(ciJobs.build.includes(`- name: ${step}\n        ${releaseEvents}\n`),
    `${step} runs for a push to main and in the merge queue, whose release that push may reuse`);
}
assert.match(ciJobs.storybook, /name: storybook-static-\$\{\{ github\.sha \}\}\n {10}path: storybook-static\n/);
for (const job of ['test-suites', 'browser-tests']) {
  assert.match(ciJobs[job], /^ {4}needs: \[build, storybook\]$/m, `${job} must test the built outputs`);
  assert.ok(ciJobs[job].includes("    if: ${{ !cancelled() && needs.build.result == 'success' && needs.storybook.result == 'success' }}\n"),
    `${job} must run after both builds even though the reuse job upstream was skipped`);
  assert.ok(ciJobs[job].includes(buildOutputsName), `${job} must download the validated build outputs`);
  assert.match(ciJobs[job], /uses: actions\/download-artifact@v8\n {8}with:\n {10}name: build-outputs-\$\{\{ github\.sha \}\}\n\n/,
    'outputs restore at their repository paths (no custom download path)');
  assert.match(ciJobs[job], /name: storybook-static-\$\{\{ github\.sha \}\}\n {10}path: storybook-static\n/);
  assert.doesNotMatch(ciJobs[job], /continue-on-error/, `${job} failures must block production`);
  assert.match(ciJobs[job], /strategy:\n(?: {6}#[^\n]*\n)? {6}fail-fast: false\n/,
    'a failing shard must not cancel and hide the other shards');
}
// Only main and manual runs save the Next.js cache; every other ref only reads it.
for (const job of ['build', 'browser-observatory', 'refresh-caches']) {
  assert.match(ciJobs[job], /uses: actions\/cache\/restore@v6\n {8}with:\n {10}path: apps\/public-web\/\.next\/cache\n/);
}
assert.match(ciJobs.build, /- name: Save Next\.js build cache\n {8}if: github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\n/);
assert.doesNotMatch(ciJobs['browser-observatory'], /actions\/cache\/save/);
const releaseCreateIndex = ciJobs.build.indexOf('- name: Create immutable production release');
assert.ok(ciJobs.build.indexOf('- name: Build and smoke-test release inputs') < ciJobs.build.indexOf('- name: Upload validated build outputs'));
assert.ok(ciJobs.build.indexOf('- name: Upload validated build outputs') < releaseCreateIndex,
  'the release is packaged from the outputs the test jobs receive');
assert.ok(ciJobs.build.includes('hs-arena-release-${{ github.sha }}'), 'only the build job packages the release');
assert.match(ciJobs['test-suites'], /sudo apt-get install -y --no-install-recommends nginx openssl/,
  'the identity TLS and nginx regression tests need the system tools');

// The registry suites: browser and everything else run in two sharded matrices.
const suiteRun = ciJobs['test-suites'].match(
  /run: npm run test:suite -- ([a-z,-]+) --shard \$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\} --continue-on-failure$/m,
)?.[1];
assert.ok(suiteRun, 'the non-browser shards must run registry suites and derive the total from the matrix');
assert.deepEqual([...suiteRun.split(','), 'browser'].sort(), [...TEST_SUITE_IDS].sort(),
  'every registry suite runs in exactly one job');
const shardsOf = job => {
  const list = ciJobs[job].match(/^ {8}shard: \[([0-9, ]+)\]$/m)?.[1].split(',').map(Number);
  assert.ok(list && list.length >= 2, `${job} must be sharded`);
  assert.deepEqual(list, list.map((_, index) => index + 1), 'shards are numbered 1..N');
  return list;
};
const shardList = shardsOf('browser-tests');
assert.match(
  ciJobs['browser-tests'],
  /- name: Run registered browser shard\s+run: npm run test:suite -- browser --shard \$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\} --retry-failed-once --continue-on-failure --quarantine exclude$/m,
  'shards derive the total from the matrix, retry a failing file exactly once, report every failure and skip the quarantine',
);
// Quarantined flaky tests run on every event in their own job that never gates
// CI required or the deployment (both need lists are asserted exactly above).
const quarantineJob = ciJobs['browser-quarantine'];
assert.match(quarantineJob, /^ {4}name: Browser quarantine \(non-blocking\)$/m);
assert.ok(quarantineJob.includes("    needs: [build, storybook]\n    # Explicit: the implicit success() also fails on the skipped reuse job upstream.\n    if: ${{ !cancelled() && needs.build.result == 'success' && needs.storybook.result == 'success' }}\n    continue-on-error: true\n"),
  'the quarantine job tests the built outputs and its failure never fails the run');
assert.ok(quarantineJob.includes(buildOutputsName), 'the quarantine job must download the validated build outputs');
assert.match(quarantineJob, /name: storybook-static-\$\{\{ github\.sha \}\}\n {10}path: storybook-static\n/,
  'quarantined archetype and skeleton tests serve the Storybook build');
assert.match(quarantineJob, /- name: Run quarantined browser tests\n {8}run: npm run test:suite -- browser --retry-failed-once --continue-on-failure --quarantine only$/m);
assert.ok(!validationJobs.includes('browser-quarantine'));
assert.equal(packageScripts['test:suite'], 'node scripts/test-suite-runner.mjs --suite');
const testRegistry = JSON.parse(readFileSync('tests/test-suites.json', 'utf8'));
const testDurations = validateTestDurations(JSON.parse(readFileSync('tests/test-durations.json', 'utf8')));
const quarantined = new Set((testRegistry.quarantine ?? []).map(entry => entry.file));
const browserFiles = testRegistry.suites.find(suite => suite.id === 'browser').files;
assert.ok([...quarantined].every(file => browserFiles.includes(file)), 'only browser tests run in the browser quarantine job');
for (const [suiteIds, shardCount] of [[['browser'], shardList.length], [suiteRun.split(','), shardsOf('test-suites').length]]) {
  const files = testRegistry.suites.filter(suite => suiteIds.includes(suite.id)).flatMap(suite => suite.files)
    .filter(file => !quarantined.has(file));
  assert.deepEqual([...planShards(files, shardCount, testDurations).flat()].sort(), [...files].sort(),
    `the ${suiteIds.join(',')} shards together run every registered unquarantined file exactly once`);
}
assert.match(ciWorkflow, /CLEAN_CODE_EVENT:\s*\$\{\{ github\.event_name \}\}/);
assert.match(ciWorkflow, /CLEAN_CODE_PUSH_BEFORE:\s*\$\{\{ github\.event\.before \}\}/);
assert.match(ciWorkflow, /CLEAN_CODE_PR_BASE_SHA:\s*\$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
assert.match(ciWorkflow, /CLEAN_CODE_DISPATCH_BASE:\s*\$\{\{ inputs\.clean_code_base \}\}/);
assert.match(ciJobs['browser-observatory'], /^ {4}name: Full browser observatory \(\$\{\{ matrix\.part \}\}\)$/m);
assert.match(ciJobs['browser-observatory'], /^ {4}timeout-minutes: 25$/m);
assert.match(ciJobs['browser-observatory'], /^ {6}QA_PART: \$\{\{ matrix\.part \}\}$/m);
// Every part the QA script accepts besides `all` runs in exactly one job.
const qaParts = readFileSync('scripts/e2e-qa.mjs', 'utf8').match(/\[('all'(?:, '[a-z]+')+)\]\.includes\(qaPart\)/)?.[1]
  .split(', ').map(part => part.replaceAll("'", '')).filter(part => part !== 'all');
assert.deepEqual(ciJobs['browser-observatory'].match(/^ {8}part: \[([a-z, ]+)\]$/m)?.[1].split(', '), qaParts,
  'the observatory matrix must cover every QA part');
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
  /- name:\s*Run full browser observatory\s+run:\s*npm run qa:ci/,
  'the isolated browser job must build the current sources before testing the Next.js runtime',
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
  /sudo \/usr\/local\/sbin\/hs-arena-ci-deploy --require-capability=scraper-runtime-probe-v1 --allow-nginx-contract-hash=76e19d9b9ce6b69a0fa7444c3a898f12f37412dd6e8179623dbc0deb9cbe9b4e "\$artifact" "\$GITHUB_SHA"/,
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
