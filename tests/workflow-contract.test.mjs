import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/scrape.yml', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const mobileVisualWorkflow = readFileSync('.github/workflows/mobile-visual.yml', 'utf8');
const productionMonitorWorkflow = readFileSync('.github/workflows/production-monitor.yml', 'utf8');
const deployment = readFileSync('DEPLOYMENT.md', 'utf8');
const runnerSudoers = readFileSync('deploy/hs-arena-github-runner.sudoers', 'utf8');

assert.match(workflow, /name:\s*Validate scraper manually/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(workflow, /hs-arena-scraper\.timer/);
assert.match(workflow, /actions\/checkout@v7/);
assert.match(workflow, /actions\/setup-node@v6/);
assert.match(workflow, /node-version:\s*'22'/);
assert.doesNotMatch(workflow, /^\s*schedule:/m);
assert.doesNotMatch(workflow, /\bgit\s+(?:add|commit|push)\b/);
assert.doesNotMatch(workflow, /contents:\s*write/);
assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/);

assert.match(ciWorkflow, /name:\s*Validate and deploy application/);
assert.match(ciWorkflow, /^\s*push:\s*$/m);
assert.match(ciWorkflow, /^\s*branches:\s*\[main\]\s*$/m);
assert.match(ciWorkflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(ciWorkflow, /run:\s*npm run verify:release/);
assert.match(
  ciWorkflow,
  /browser-observatory:\s+name:\s*Full browser observatory\s+runs-on:\s*ubuntu-latest\s+timeout-minutes:\s*15\s+continue-on-error:\s*true/,
);
assert.match(
  ciWorkflow,
  /- name:\s*Run full browser observatory\s+run:\s*npm run qa:ci/,
  'the isolated browser job must build the current sources before starting Vite preview',
);
assert.match(ciWorkflow, /npm run release:create -- --output="\$RUNNER_TEMP\/release-\$GITHUB_SHA" --sha="\$GITHUB_SHA"/);
assert.match(ciWorkflow, /actions\/upload-artifact@v7/);
assert.match(ciWorkflow, /name:\s*hs-arena-release-\$\{\{ github\.sha \}\}/);
assert.match(ciWorkflow, /if-no-files-found:\s*error/);
assert.match(ciWorkflow, /retention-days:\s*7/);
assert.match(ciWorkflow, /^\s*deploy-production:\s*$/m);
assert.match(ciWorkflow, /deploy-production:[\s\S]*needs:\s*validate/);
assert.match(ciWorkflow, /needs:\s*validate/);
assert.match(ciWorkflow, /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
assert.match(ciWorkflow, /runs-on:\s*\[self-hosted,\s*linux,\s*x64,\s*hs-arena-production\]/);
assert.match(ciWorkflow, /environment:\s*\n\s*name:\s*production\s*\n\s*url:\s*https:\/\/arena\.hs-manacost\.ru/);
assert.match(ciWorkflow, /group:\s*hs-arena-production/);
assert.match(ciWorkflow, /cancel-in-progress:\s*false/);
assert.match(ciWorkflow, /actions\/download-artifact@v7/);
assert.match(ciWorkflow, /sudo \/usr\/local\/sbin\/hs-arena-ci-deploy "\$artifact" "\$GITHUB_SHA"/);
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
assert.match(mobileVisualWorkflow, /timeout-minutes:\s*30/);
assert.match(mobileVisualWorkflow, /PUPPETEER_SKIP_DOWNLOAD:\s*'true'/);
assert.match(mobileVisualWorkflow, /QA_RESPONSIVE_SCOPE:\s*all-p0/);
assert.match(
  mobileVisualWorkflow,
  /- name:\s*Run full responsive visual QA\s+env:\s+QA_SCREENSHOT_DIR:\s*\$\{\{ runner\.temp \}\}\/mobile-visual-qa\s+run:\s*npm run qa:responsive:all/,
);
assert.match(mobileVisualWorkflow, /actions\/checkout@v7/);
assert.match(mobileVisualWorkflow, /actions\/setup-node@v6/);
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
assert.match(productionMonitorWorkflow, /actions\/setup-node@v6/);
assert.match(productionMonitorWorkflow, /node-version:\s*'22'/);
assert.match(productionMonitorWorkflow, /PRODUCTION_BASE_URL:\s*https:\/\/arena\.hs-manacost\.ru/);
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

console.log('workflow ownership contracts passed');
