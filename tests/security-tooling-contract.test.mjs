import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');

test('browser QA and production scraper use one supported Puppeteer graph', () => {
  const manifest = JSON.parse(read('package.json'));
  const lockfile = JSON.parse(read('package-lock.json'));
  assert.equal(manifest.dependencies?.puppeteer, undefined);
  assert.equal(manifest.dependencies?.['puppeteer-core'], '25.4.0');
  assert.equal(manifest.devDependencies?.puppeteer, '25.4.0');
  assert.equal(manifest.overrides?.['@puppeteer/browsers'], undefined);
  assert.equal(lockfile.packages?.['node_modules/puppeteer-core']?.version, '25.4.0');
  assert.equal(
    lockfile.packages?.['node_modules/puppeteer-core']?.dependencies?.['@puppeteer/browsers'],
    '3.0.6',
  );
  assert.equal(manifest.overrides?.nanoid, '3.3.18');
});

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
  assert.match(workflow, /npm run security:gitleaks/);
  assert.doesNotMatch(workflow, /gitleaks\/gitleaks-action@/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
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

test('Dependency Review blocks risky dependency changes with an immutable action', () => {
  const workflow = read('.github/workflows/dependency-review.yml');
  const config = read('.github/dependency-review-config.yml');
  assert.match(workflow, /actions\/dependency-review-action@[a-f0-9]{40}/);
  assert.match(workflow, /config-file:\s*\.\/\.github\/dependency-review-config\.yml/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.doesNotMatch(workflow, /pull-requests:\s*write/);
  assert.match(config, /fail-on-severity:\s*high/);
  assert.match(config, /license-check:\s*true/);
  assert.match(config, /vulnerability-check:\s*true/);
  assert.match(config, /comment-summary-in-pr:\s*never/);
  assert.doesNotMatch(config, /allow-ghsas:/);
});

test('Trivy blocks high-risk repository findings and publishes a redacted SARIF surface', () => {
  const workflow = read('.github/workflows/trivy.yml');
  assert.match(workflow, /aquasecurity\/trivy-action@[a-f0-9]{40}/);
  assert.match(workflow, /version:\s*v0\.72\.0/);
  assert.match(workflow, /scan-type:\s*fs/);
  assert.match(workflow, /scanners:\s*vuln,misconfig/);
  assert.match(workflow, /severity:\s*HIGH,CRITICAL/);
  assert.match(workflow, /exit-code:\s*"1"/);
  assert.match(workflow, /limit-severities-for-sarif:\s*true/);
  assert.match(workflow, /github\/codeql-action\/upload-sarif@[a-f0-9]{40}/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
});
