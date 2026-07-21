import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const browserQa = readFileSync(new URL('../scripts/e2e-qa.mjs', import.meta.url), 'utf8');
const browserQaCi = readFileSync(new URL('../scripts/browser-qa-ci.mjs', import.meta.url), 'utf8');
const responsiveQaLocal = readFileSync(new URL('../scripts/responsive-qa-local.mjs', import.meta.url), 'utf8');
const layoutDiagnostics = readFileSync(new URL('../scripts/mobile-layout-diagnostics.mjs', import.meta.url), 'utf8');
const applicationCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
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
assert.ok(
  layoutDiagnostics.includes("viewport: { width: innerWidth, height: innerHeight }"),
  'route overflow diagnostics must include the exact viewport',
);
assert.ok(
  browserQa.includes("first fault: ${JSON.stringify(layout.firstLayoutFault)}"),
  'route overflow failures must print the first offending element',
);
assert.ok(
  layoutDiagnostics.includes("&& !hasIntentionalHorizontalScroller(element)"),
  'route overflow diagnostics must ignore intentional horizontal scrollers',
);
assert.ok(
  layoutDiagnostics.includes("if (!(element instanceof Element)) return false;"),
  'route overflow diagnostics must include SVG and other visible element types',
);
assert.ok(
  applicationCss.includes('@source not "../.codex-team";'),
  'Tailwind must ignore local agent traces so release CSS is reproducible',
);
assert.ok(
  browserQa.includes("../config/responsive-route-fixtures.json"),
  'browser QA must consume the validated responsive route inventory',
);
assert.ok(
  browserQa.includes("['off', 'representative', 'all-p0']"),
  'browser QA must expose explicit responsive matrix scopes',
);
assert.ok(
  browserQa.includes('responsiveFixtures.length} fixtures × ${responsiveProfiles.length} profiles'),
  'browser QA must execute the route-state and viewport cross product',
);
assert.ok(
  browserQa.includes('touch targets below 44px'),
  'responsive QA must enforce the 44px touch target floor',
);
assert.ok(
  browserQa.includes('responsive-manifest.json'),
  'responsive screenshots must have a machine-readable manifest',
);
assert.ok(
  browserQa.includes('QA_RESPONSIVE_VIEWPORTS must be a comma-separated list of non-empty integer widths'),
  'responsive viewport overrides must fail closed on malformed input',
);
assert.ok(
  browserQa.includes('QA_RESPONSIVE_VIEWPORTS must not contain duplicate widths'),
  'responsive viewport overrides must fail closed on duplicate widths',
);
assert.ok(
  browserQa.includes("collectRuntimeErrors(page, { sameOriginNetwork: true })"),
  'responsive QA must treat failed same-origin API and asset requests as runtime failures',
);
assert.ok(
  browserQa.includes("request.frame() === page.mainFrame()")
    && browserQa.includes("url.pathname === notFoundDocument.pathname"),
  'local 404 substitution must be limited to the exact main-frame fixture document',
);
assert.ok(
  browserQa.includes('expected status-preserving HTTP 404')
    && browserQa.includes('httpStatus = navigationResponse?.status()'),
  'responsive QA must assert and record the not-found document HTTP status',
);
assert.ok(
  !browserQa.includes('deferred-to-nginx'),
  'the production 404 fixture must be captured rather than deferred',
);
assert.ok(
  browserQa.includes("createHash('sha256').update(readFileSync(screenshotPath)).digest('hex')"),
  'responsive screenshot manifest must fingerprint every captured image',
);
assert.ok(
  browserQa.includes('renameSync(responsiveManifestTemporaryPath, responsiveManifestPath)'),
  'responsive manifest publication must be atomic',
);
assert.ok(
  browserQa.includes("qaStatus: scenarioFailures.length ? 'failed' : 'passed'"),
  'responsive manifest must report QA outcome independently from screenshot capture',
);
assert.ok(
  browserQaCi.includes("QA_RESPONSIVE_SCOPE: process.env.QA_RESPONSIVE_SCOPE || 'representative'"),
  'push/PR browser QA must run the representative responsive matrix by default',
);
assert.equal(
  scripts['qa:responsive'],
  'QA_RESPONSIVE_SCOPE=representative node scripts/responsive-qa-local.mjs',
  'representative responsive QA must use the isolated local build runner',
);
assert.equal(
  scripts['qa:responsive:all'],
  'QA_RESPONSIVE_SCOPE=all-p0 node scripts/responsive-qa-local.mjs',
  'all-P0 responsive QA must use the isolated local build runner',
);
assert.ok(
  responsiveQaLocal.includes('mkdtempSync(join(tmpdir(),'),
  'local responsive QA must build in a unique temporary directory',
);
assert.ok(
  responsiveQaLocal.includes('PRERENDER_DIST_DIR: distDirectory'),
  'local responsive QA must prerender into the isolated build directory',
);
assert.ok(
  responsiveQaLocal.includes('QA_PREVIEW_DIST_DIR: distDirectory'),
  'local responsive QA must preview the isolated build directory',
);
assert.ok(
  browserQaCi.includes("previewArgs.push('--outDir', process.env.QA_PREVIEW_DIST_DIR)"),
  'browser QA preview must accept an isolated build directory',
);
assert.ok(
  browserQaCi.includes("'--port', '0', '--strictPort'"),
  'browser QA preview must use an isolated ephemeral port',
);
assert.ok(
  browserQaCi.includes('stripVTControlCharacters(previewOutput).match(/Local:'),
  'browser QA must derive and parse a colorized origin from the child Vite process',
);

console.log('QA command contract tests passed');
