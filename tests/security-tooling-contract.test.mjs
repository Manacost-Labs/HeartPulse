import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');

test('CodeQL scans JavaScript and TypeScript with the extended suite', () => {
  const workflow = read('.github/workflows/codeql.yml');
  assert.match(workflow, /languages:\s*javascript-typescript/);
  assert.match(workflow, /queries:\s*security-extended/);
  assert.match(workflow, /security-events:\s*write/);
  assert.match(workflow, /github\/codeql-action\/init@[a-f0-9]{40}/);
  assert.match(workflow, /github\/codeql-action\/analyze@[a-f0-9]{40}/);
});

test('Gitleaks scans full history without publishing secret-bearing artifacts or comments', () => {
  const workflow = read('.github/workflows/gitleaks.yml');
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /gitleaks\/gitleaks-action@[a-f0-9]{40}/);
  assert.match(workflow, /GITLEAKS_VERSION:\s*"8\.30\.1"/);
  assert.match(workflow, /GITLEAKS_ENABLE_COMMENTS:\s*"false"/);
  assert.match(workflow, /GITLEAKS_ENABLE_UPLOAD_ARTIFACT:\s*"false"/);
});

test('OSV blocks both new PR vulnerabilities and complete inventory findings', () => {
  const workflow = read('.github/workflows/osv-scanner.yml');
  assert.match(workflow, /osv-scanner-reusable-pr\.yml@[a-f0-9]{40}/);
  assert.match(workflow, /osv-scanner-reusable\.yml@[a-f0-9]{40}/);
  assert.match(workflow, /--lockfile=\.\/package-lock\.json/);
  assert.doesNotMatch(workflow, /fail-on-vuln:\s*false/);
  assert.match(workflow, /security-events:\s*write/);
});

test('Scorecard is immutable, private-by-default and uploads SARIF', () => {
  const workflow = read('.github/workflows/scorecard.yml');
  assert.match(workflow, /ossf\/scorecard-action@[a-f0-9]{40}/);
  assert.match(workflow, /publish_results:\s*false/);
  assert.match(workflow, /github\/codeql-action\/upload-sarif@[a-f0-9]{40}/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
});

test('Dependabot groups routine npm and Actions updates without assignees', () => {
  const config = read('.github/dependabot.yml');
  assert.match(config, /package-ecosystem:\s*npm/);
  assert.match(config, /package-ecosystem:\s*github-actions/);
  assert.match(config, /production-minor-and-patch/);
  assert.match(config, /development-minor-and-patch/);
  assert.doesNotMatch(config, /assignees:/);
});
