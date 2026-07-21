import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/scrape.yml', 'utf8');
const mobileVisualWorkflow = readFileSync('.github/workflows/mobile-visual.yml', 'utf8');
const deployment = readFileSync('DEPLOYMENT.md', 'utf8');

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

assert.match(deployment, /shared\/server-data/);
assert.match(deployment, /hs-arena-scraper\.timer/);

console.log('workflow ownership contracts passed');
