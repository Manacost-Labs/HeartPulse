import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const browserQa = readFileSync(new URL('../scripts/e2e-qa.mjs', import.meta.url), 'utf8');
const { scripts } = packageJson;

assert.equal(
  scripts['qa:ci'],
  'npm run build && node scripts/browser-qa-ci.mjs',
  'standalone qa:ci must build current sources before serving dist',
);

const verifySteps = scripts['verify:ci'].split(' && ');
assert.equal(
  verifySteps.filter(step => step === 'npm run build').length,
  1,
  'verify:ci must build exactly once',
);
assert.ok(
  verifySteps.includes('node scripts/browser-qa-ci.mjs'),
  'verify:ci must test the build it already produced',
);
assert.ok(
  !verifySteps.includes('npm run qa:ci'),
  'verify:ci must not trigger the standalone command and rebuild a second time',
);

for (const viewport of [
  'width: 320, height: 568',
  'width: 390, height: 844',
  'width: 768, height: 1024',
  'width: 1024, height: 768',
  'width: 1440, height: 900',
  'width: 844, height: 390',
]) {
  assert.ok(browserQa.includes(viewport), `browser QA must cover the shell viewport ${viewport}`);
}
assert.ok(browserQa.includes('scrollY=500'), 'browser QA must verify the shell after a deterministic 500px scroll');
assert.ok(browserQa.includes('firstLayoutFault'), 'browser QA must report the first clipping or overflow element');
assert.ok(
  browserQa.includes("rect: rect(firstPageOverflowElement)"),
  'browser QA overflow diagnostics must include the failing element bounding box',
);

console.log('QA command contract tests passed');
