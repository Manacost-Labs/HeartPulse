import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
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

console.log('QA command contract tests passed');
